#!/bin/zsh
cd -- "${0:A:h}"
exec node dist/server.mjs --preview
