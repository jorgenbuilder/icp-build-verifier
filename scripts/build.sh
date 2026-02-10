#!/bin/bash
set -euo pipefail

echo "=== ICP Build Verifier ==="

# Check for required files
if [ ! -f "build-steps.json" ]; then
    echo "Error: build-steps.json not found. Run extract-build-steps.ts first."
    exit 1
fi

if [ ! -f "proposal.json" ]; then
    echo "Error: proposal.json not found. Run fetch-proposal.ts first."
    exit 1
fi

# Parse JSON files using node
COMMIT_HASH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('build-steps.json')).commitHash)")
REPO_URL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('build-steps.json')).repoUrl)")
WASM_OUTPUT_PATH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('build-steps.json')).wasmOutputPath)")
WASM_FILENAME=$(basename "$WASM_OUTPUT_PATH")

echo "Repository: $REPO_URL"
echo "WASM filename: $WASM_FILENAME"
echo "Commit hash: $COMMIT_HASH"
echo "Expected WASM output: $WASM_OUTPUT_PATH"

# Clone repository
echo ""
echo "=== Cloning repository ==="
if [ -d "repo" ]; then
    echo "Removing existing repo directory..."
    rm -rf repo
fi

# Shallow clone, then fetch the specific commit
git clone --depth 1 "$REPO_URL" repo
cd repo

echo "Fetching commit $COMMIT_HASH..."
git fetch --depth 1 origin "$COMMIT_HASH"
git checkout "$COMMIT_HASH"

# Detect IC monorepo and resolve Bazel target
IS_IC_MONOREPO=false
BAZEL_TARGET=""

if [[ "$REPO_URL" == *"github.com/dfinity/ic"* ]]; then
    IS_IC_MONOREPO=true
    echo ""
    echo "=== Detected IC monorepo - attempting targeted Bazel build ==="

    BUILD_BAZEL="publish/canisters/BUILD.bazel"
    if [ -f "$BUILD_BAZEL" ]; then
        # Parse CANISTERS dict: "governance-canister.wasm.gz": "//rs/nns/governance:governance-canister"
        BAZEL_TARGET=$(grep -E "\"$WASM_FILENAME\"\s*:" "$BUILD_BAZEL" | \
            sed -E 's/.*"[^"]+"\s*:\s*"([^"]+)".*/\1/' | \
            head -1) || true

        if [ -n "$BAZEL_TARGET" ]; then
            echo "Found Bazel target: $BAZEL_TARGET"
        else
            echo "Could not find target for $WASM_FILENAME, will use full build"
        fi
    fi
fi

# Patch any scripts that force DOCKER_BUILDKIT=1
echo "Patching docker-build scripts to disable BuildKit..."
find . -name "docker-build" -type f -exec sed -i 's/export DOCKER_BUILDKIT=1/export DOCKER_BUILDKIT=0/g' {} \;

echo ""
echo "=== Running build steps ==="

# Helper function to setup builder user (bazel's rules_python requires non-root)
setup_builder_user() {
    if [ "$(id -u)" = "0" ]; then
        echo "Running as root, creating build user for bazel..."
        useradd -m -s /bin/bash builder 2>/dev/null || true
        chown -R builder:builder .
        mkdir -p /home/builder/.cache
        chown -R builder:builder /home/builder
        if [ -S /var/run/docker.sock ]; then
            echo "Granting builder user access to Docker socket..."
            DOCKER_SOCKET_GID=$(stat -c '%g' /var/run/docker.sock)
            echo "Docker socket GID: $DOCKER_SOCKET_GID"
            groupadd -g "$DOCKER_SOCKET_GID" -f docker 2>/dev/null || true
            usermod -aG "$DOCKER_SOCKET_GID" builder 2>/dev/null || true
        fi
        return 0
    fi
    return 1
}

TARGETED_BUILD_SUCCESS=false

# Try targeted Bazel build if we have a target
if [ -n "$BAZEL_TARGET" ]; then
    echo ""
    echo "=== TARGETED Bazel build: $BAZEL_TARGET ==="

    BAZEL_CMD="bazel build --config=local --config=stamped $BAZEL_TARGET"

    if setup_builder_user; then
        echo ">>> Executing (as builder): $BAZEL_CMD"
        if su - builder -c "cd $(pwd) && $BAZEL_CMD"; then
            TARGETED_BUILD_SUCCESS=true
        fi
    else
        echo ">>> Executing: $BAZEL_CMD"
        if eval "$BAZEL_CMD"; then
            TARGETED_BUILD_SUCCESS=true
        fi
    fi

    if [ "$TARGETED_BUILD_SUCCESS" = false ]; then
        echo "Targeted build failed, falling back to full build..."
    fi
fi

# Fallback to full build
if [ "$TARGETED_BUILD_SUCCESS" = false ]; then
    echo ""
    echo "=== Running full build ==="

    # Create marker file to prevent nested container spawning
    # The IC build scripts check for /home/ubuntu/.ic-build-container to detect
    # if they're already running inside the ic-build container
    mkdir -p /home/ubuntu
    touch /home/ubuntu/.ic-build-container
    echo "Created /home/ubuntu/.ic-build-container marker file"

    # Read build steps
    STEPS=$(node -e "JSON.parse(require('fs').readFileSync('../build-steps.json')).steps.forEach(s => console.log(s))")

    if setup_builder_user; then
        # Execute each step as builder user
        while IFS= read -r step; do
            if [ -n "$step" ]; then
                echo ""
                echo ">>> Executing (as builder): $step"
                su - builder -c "cd $(pwd) && export DOCKER_BUILDKIT=0 DFINITY_CONTAINER=${DFINITY_CONTAINER:-} && $step" || {
                    echo "Warning: Build command returned non-zero exit code: $?"
                    echo "Checking if build artifacts were produced anyway..."
                }
            fi
        done <<< "$STEPS"
    else
        # Execute each step normally
        while IFS= read -r step; do
            if [ -n "$step" ]; then
                echo ""
                echo ">>> Executing: $step"
                export DOCKER_BUILDKIT=0 DFINITY_CONTAINER=${DFINITY_CONTAINER:-} && eval "$step"
            fi
        done <<< "$STEPS"
    fi
fi

echo ""
echo "=== Build complete ==="

# Copy output WASM to known location
mkdir -p ../output

if [ "$TARGETED_BUILD_SUCCESS" = true ]; then
    # Derive bazel-bin path: //rs/nns/governance:governance-canister -> bazel-bin/rs/nns/governance/governance-canister.wasm.gz
    BAZEL_PACKAGE=$(echo "$BAZEL_TARGET" | sed 's|^//||' | sed 's|:.*||')
    BAZEL_TARGET_NAME=$(echo "$BAZEL_TARGET" | sed 's|.*:||')
    BAZEL_OUTPUT="bazel-bin/$BAZEL_PACKAGE/${BAZEL_TARGET_NAME}.wasm.gz"

    echo "Looking for Bazel output at: $BAZEL_OUTPUT"

    if [ -f "$BAZEL_OUTPUT" ]; then
        cp "$BAZEL_OUTPUT" ../output/canister.wasm
        echo "Copied Bazel output to ../output/canister.wasm"
    else
        echo "Expected Bazel output not found, searching bazel-bin for $WASM_FILENAME..."
        FOUND=$(find bazel-bin -name "$WASM_FILENAME" -type f 2>/dev/null | head -1)
        if [ -n "$FOUND" ]; then
            cp "$FOUND" ../output/canister.wasm
            echo "Copied $FOUND to ../output/canister.wasm"
        else
            echo "Error: Could not find $WASM_FILENAME in bazel-bin"
            exit 1
        fi
    fi
else
    # Original full build output path
    if [ -f "$WASM_OUTPUT_PATH" ]; then
        cp "$WASM_OUTPUT_PATH" ../output/canister.wasm
        echo "Copied WASM to ../output/canister.wasm"
    else
        echo "Warning: Expected WASM not found at $WASM_OUTPUT_PATH"
        echo "Searching for .wasm files..."
        find . -name "*.wasm" -type f 2>/dev/null | head -20
        exit 1
    fi
fi

cd ..
echo ""
echo "=== Build verification ready ==="
ls -la output/

# Explicitly exit with success code
exit 0
