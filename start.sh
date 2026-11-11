#!/bin/sh
# Starts the trainer. Uses the Node.js already on this machine if it is version 18 or
# newer; otherwise downloads an official Node.js build into this folder (./.node) and uses
# that. Nothing is installed system-wide and no admin rights are needed.
set -e
cd "$(dirname "$0")"

NEED=18
NODE_VERSION=v22.12.0 # the build fetched when this machine has no suitable Node

major() {
  "$1" -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0
}

NODE=""
if command -v node >/dev/null 2>&1 && [ "$(major node)" -ge "$NEED" ]; then
  NODE=node
elif [ -x .node/bin/node ] && [ "$(major .node/bin/node)" -ge "$NEED" ]; then
  NODE=.node/bin/node
else
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) echo "Unsupported system. Install Node.js $NEED or newer from https://nodejs.org and run: npm start" >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    arm64 | aarch64) arch=arm64 ;;
    x86_64 | amd64) arch=x64 ;;
    *) echo "Unsupported processor. Install Node.js $NEED or newer from https://nodejs.org and run: npm start" >&2; exit 1 ;;
  esac
  file="node-$NODE_VERSION-$os-$arch.tar.gz"
  base="https://nodejs.org/dist/$NODE_VERSION"
  echo "Node.js $NEED or newer was not found. Downloading $file from nodejs.org into ./.node (about 45 MB)..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$base/$file" -o ".node-download.tar.gz"
    sums=$(curl -fsSL "$base/SHASUMS256.txt")
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$base/$file" -O ".node-download.tar.gz"
    sums=$(wget -q "$base/SHASUMS256.txt" -O -)
  else
    echo "Need curl or wget to download Node.js. Or install it from https://nodejs.org and run: npm start" >&2
    exit 1
  fi
  # Check the download against the checksum nodejs.org publishes for it.
  want=$(printf '%s\n' "$sums" | awk -v f="$file" '$2 == f { print $1 }')
  if command -v shasum >/dev/null 2>&1; then
    got=$(shasum -a 256 ".node-download.tar.gz" | awk '{ print $1 }')
  else
    got=$(sha256sum ".node-download.tar.gz" | awk '{ print $1 }')
  fi
  if [ -z "$want" ] || [ "$want" != "$got" ]; then
    rm -f ".node-download.tar.gz"
    echo "The Node.js download did not match its published checksum, so it was discarded. Try again, or install Node.js from https://nodejs.org." >&2
    exit 1
  fi
  mkdir -p .node
  tar -xzf ".node-download.tar.gz" -C .node --strip-components=1
  rm -f ".node-download.tar.gz"
  NODE=.node/bin/node
  echo "Node.js $("$NODE" -v) is ready in ./.node."
fi

exec "$NODE" server.js
