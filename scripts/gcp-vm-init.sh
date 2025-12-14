#!/bin/bash
# GCP VM Initialization Script for NxScraper Engine
# Installs Docker, Docker Compose, and Git on Debian/Ubuntu based systems

set -e

echo "🚀 Starting NxScraper VM Initialization..."

# 1. Update system
echo "📦 Updating system packages..."
sudo apt-get update
# Avoid lengthy upgrades in non-interactive mode if possible, or use defaults
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

# 2. Install dependencies
echo "🛠️ Installing basic dependencies..."
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    unzip \
    htop

# 3. Install Docker (Official Docker Script Method)
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    
    # Add Docker's official GPG key:
    sudo mkdir -p /etc/apt/keyrings
    if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    fi
    
    # Set up the repository:
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # 4. Configure permissions
    echo "👤 Adding current user ($USER) to docker group..."
    sudo groupadd -f docker
    sudo usermod -aG docker "$USER"
    
    echo "✅ Docker installed successfully!"
else
    echo "✅ Docker is already installed."
fi

# 5. Summary
echo ""
echo "🎉 VM Initialization Complete!"
echo "========================================================"
echo "⚠️  IMPORTANT: You must LOG OUT and LOG BACK IN now!"
echo "   (or run 'newgrp docker' to apply permissions immediately)"
echo "========================================================"
echo "👉 Next Step: Run './scripts/setup.sh' to configure secrets."
