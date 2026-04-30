#!/bin/bash

# Exit on error
set -e

# Path to the files
PROXY_FILE="swap.ts"
TEMPLATE_FILE="README.template.md"
OUTPUT_FILE="README.md"

if [ ! -f "$PROXY_FILE" ]; then
    echo "build.sh error:: $PROXY_FILE not found"
    exit 1
fi

if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "build.sh error:: $TEMPLATE_FILE not found"
    exit 1
fi

# Generate SHA256 hash
# Try sha256sum first (Linux), then shasum (macOS)
if command -v sha256sum >/dev/null 2>&1; then
    HASH=$(sha256sum "$PROXY_FILE")
elif command -v shasum >/dev/null 2>&1; then
    HASH=$(shasum -a 256 "$PROXY_FILE")
else
    echo "build.sh error:: Neither sha256sum nor shasum found"
    exit 1
fi

# Replace 'shahash' with the generated hash in the output file
# We use perl here as it handles the replacement string reliably even if it contains spaces
perl -pe "s/shahash/$HASH/g" "$TEMPLATE_FILE" > "$OUTPUT_FILE"

echo "Generated $OUTPUT_FILE with hash: $HASH"
