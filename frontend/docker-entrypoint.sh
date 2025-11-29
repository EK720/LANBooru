#!/bin/sh

# Generate runtime config from VITE_* environment variables
# This allows env vars to be set at container runtime, not build time

CONFIG_FILE="/usr/share/nginx/html/config.js"

echo "window.__ENV__ = {" > "$CONFIG_FILE"

# Find all VITE_* env vars and write them to config
env | grep "^VITE_" | while read -r line; do
  key=$(echo "$line" | cut -d '=' -f 1)
  value=$(echo "$line" | cut -d '=' -f 2-)
  echo "  \"$key\": \"$value\"," >> "$CONFIG_FILE"
done

echo "};" >> "$CONFIG_FILE"

echo "Generated runtime config:"
cat "$CONFIG_FILE"

# Execute the main command (nginx)
exec "$@"
