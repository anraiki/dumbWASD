#!/bin/bash
# ~/bin/update-yume.sh

# Remove old version
sudo pacman -R yume --noconfirm

# Download latest .deb from GitHub releases
cd /tmp
curl -sL $(curl -s https://api.github.com/repos/aofp/yume/releases/latest | grep "browser_download_url.*\.deb" | cut -d '"' -f 4) -o yume-latest.deb

# Convert and install
debtap -Q yume-latest.deb
sudo pacman -U yume-*.pkg.tar.zst --noconfirm

# Cleanup
rm -f yume-latest.deb yume-*.pkg.tar.zst