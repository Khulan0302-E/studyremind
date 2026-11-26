#!/bin/bash
# Mac дээр давхар товшиход серверийг асааж, хөтөч нээнэ.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js олдсонгүй. https://nodejs.org-оос LTS хувилбарыг суулгана уу."
  read -r -p "Enter дарж хаана уу..."
  exit 1
fi
(sleep 1.5 && open "http://localhost:3000") &
node server/index.js
