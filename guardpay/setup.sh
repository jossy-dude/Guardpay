#!/bin/bash
# GuardPay Setup Script
# This script installs the 'guardpay' command to your PATH

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"
GUARDPAY_BIN="$INSTALL_DIR/guardpay"

echo "Setting up GuardPay..."
echo ""

# Create install directory if it doesn't exist
mkdir -p "$INSTALL_DIR"

# Create the guardpay command
cat > "$GUARDPAY_BIN" << EOF
#!/bin/bash
cd "$SCRIPT_DIR"
if command -v python3 &>/dev/null; then
    python3 server.py "\$@"
elif command -v python &>/dev/null; then
    python server.py "\$@"
else
    echo "Error: Python 3 is required to run GuardPay"
    exit 1
fi
EOF

chmod +x "$GUARDPAY_BIN"

echo "✅ GuardPay installed successfully!"
echo ""
echo "You can now run 'guardpay' from anywhere in your terminal."
echo ""
echo "Usage:"
echo "  guardpay          # Start server on port 8420"
echo "  guardpay 9000     # Start server on port 9000"
echo ""

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo "⚠️  Note: $INSTALL_DIR is not in your PATH."
    echo "   Add this to your ~/.bashrc or ~/.zshrc:"
    echo ""
    echo "   export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
fi

echo "Open http://localhost:8420 in your browser to start using GuardPay."
