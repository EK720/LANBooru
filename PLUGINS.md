# LANBooru Plugin Development Guide

This guide explains how to create plugins for LANBooru.

## Overview

Plugins extend LANBooru's functionality by:
- Adding buttons to the frontend UI
- Hooking into backend operations (image scans, tag updates, etc.)
- Running external services for heavy processing (AI models, etc.)

## Plugin Types

### 1. Builtin Plugins

**Best for:** Simple logic that runs inside the LANBooru backend process.

Builtin plugins are Node.js modules loaded directly into the backend. They have no separate process and no API - just hooks that execute during LANBooru operations.

**Example use cases:**
- Auto-formatting tags (lowercase, replace spaces with underscores)
- Validating tags against a whitelist
- Logging/analytics

**Structure:**
```
my-plugin.lbplugin (tar.gz)
├── manifest.json
└── hooks.js
```

**manifest.json:**
```json
{
  "id": "tag-formatter",
  "name": "Tag Formatter",
  "version": "1.0.0",
  "description": "Auto-formats tags to booru conventions",
  "type": "builtin",
  "hooks": {
    "backend": "./hooks.js"
  }
}
```

**hooks.js:**
```javascript
module.exports = {
  // Transform tags before they're saved
  onBeforeTagUpdate: async (context, imageId, tags) => {
    return tags.map(tag =>
      tag.toLowerCase().replace(/\s+/g, '_')
    );
  }
};
```

---

### 2. Container Plugins

**Best for:** Heavy processing that needs its own environment (Python, GPU, etc.)

Container plugins run as separate Docker containers managed by LANBooru. They expose an HTTP API that LANBooru proxies requests to.

**Example use cases:**
- AI image tagging
- Image upscaling
- Duplicate detection with ML

**Structure:**
```
ai-tagger.lbplugin (tar.gz)
├── manifest.json
├── hooks.js          # Optional: auto-tag on scan
└── docker/
    ├── Dockerfile
    ├── requirements.txt
    └── app.py
```

**manifest.json:**
```json
{
  "id": "ai-tagger",
  "name": "AI Auto-Tagger",
  "version": "1.0.0",
  "description": "Tag images using WD Tagger v3",
  "type": "container",

  "container": {
    "build": "./docker",
    "gpu": true,
    "environment": {
      "MODEL_NAME": "SmilingWolf/wd-swinv2-tagger-v3"
    }
  },

  "api": {
    "baseUrl": "http://plugin-ai-tagger:5000",
    "healthCheck": "/health",
    "timeout": 60000
  },

  "frontend": {
    "buttons": [
      {
        "id": "auto-tag",
        "label": "Auto-Tag",
        "icon": "AutoAwesome",
        "location": "image-actions",
        "endpoint": "tag"
      }
    ]
  },

  "config": [
    {
      "key": "threshold",
      "type": "number",
      "label": "Confidence Threshold",
      "description": "Minimum confidence to include a tag (0-1)",
      "default": 0.35,
      "min": 0,
      "max": 1,
      "step": 0.05
    }
  ]
}
```

---

### 3. External Plugins

**Best for:** Connecting to services you manage yourself.

External plugins point to an HTTP service you run independently. LANBooru doesn't start or stop it - it just proxies requests.

**Example use cases:**
- Connecting to an existing AI service on your network
- Using a cloud API
- Shared services across multiple LANBooru instances

**Structure:**
```
my-service.lbplugin (tar.gz)
└── manifest.json
```

**manifest.json:**
```json
{
  "id": "my-tagger",
  "name": "My Tagger Service",
  "version": "1.0.0",
  "description": "Connect to my existing tagger service",
  "type": "external",

  "api": {
    "baseUrl": "http://192.168.1.100:5000",
    "healthCheck": "/health"
  },

  "frontend": {
    "buttons": [
      {
        "id": "tag",
        "label": "Tag with My Service",
        "location": "image-actions",
        "endpoint": "tag"
      }
    ]
  }
}
```

---

## Manifest Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (lowercase, no spaces) |
| `name` | string | Display name |
| `version` | string | Semantic version (e.g., "1.0.0") |
| `description` | string | Short description |
| `type` | string | One of: `builtin`, `container`, `external` |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `author` | string | Plugin author |
| `homepage` | string | URL to plugin homepage/repo |
| `license` | string | License identifier |

### Type-Specific Fields

#### For `container` type:

```json
"container": {
  "image": "myrepo/my-plugin:latest",  // OR use build
  "build": "./docker",                  // Path to Dockerfile directory
  "ports": ["5000:5000"],              // Internal port mappings
  "environment": { ... },               // Environment variables
  "volumes": ["./data:/app/data"],     // Volume mounts
  "gpu": true                          // Request GPU access
}
```

#### For `container` and `external` types:

```json
"api": {
  "baseUrl": "http://hostname:port",   // Required
  "healthCheck": "/health",            // Optional health endpoint
  "timeout": 30000                     // Request timeout in ms
}
```

### Hooks Configuration

```json
"hooks": {
  "backend": "./hooks.js"    // Path to Node.js hooks file
}
```

### Frontend Configuration

```json
"frontend": {
  "buttons": [ ... ]    // See Button Configuration below
}
```

### Plugin Configuration Schema

Define user-configurable settings:

```json
"config": [
  {
    "key": "threshold",
    "type": "number",
    "label": "Confidence Threshold",
    "description": "Minimum confidence (0-1)",
    "default": 0.35,
    "min": 0,
    "max": 1,
    "step": 0.05,
    "required": false
  },
  {
    "key": "model",
    "type": "select",
    "label": "Model",
    "default": "v3",
    "options": [
      { "value": "v2", "label": "WD Tagger v2" },
      { "value": "v3", "label": "WD Tagger v3" }
    ]
  },
  {
    "key": "apiKey",
    "type": "password",
    "label": "API Key",
    "required": true
  }
]
```

**Config field types:**
- `string` - Text input
- `password` - Hidden text input
- `number` - Numeric input with optional min/max/step
- `boolean` - Toggle switch
- `select` - Dropdown with predefined options

---

## Button Configuration

Buttons appear in the LANBooru UI and trigger plugin endpoints.

```json
{
  "id": "auto-tag",
  "label": "Auto-Tag",
  "icon": "AutoAwesome",
  "tooltip": "Generate tags using AI",
  "location": "image-actions",
  "endpoint": "tag",
  "method": "POST",
  "confirmMessage": "Run AI tagging on this image?"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique button identifier |
| `label` | Yes | Button text |
| `icon` | No | Material UI icon name |
| `tooltip` | No | Hover tooltip text |
| `location` | Yes | Where to show the button |
| `endpoint` | Yes | API endpoint (relative to plugin) |
| `method` | No | HTTP method (default: POST) |
| `confirmMessage` | No | Show confirmation dialog first |

**Button locations:**
- `image-actions` - Top bar on single image view
- `gallery-toolbar` - Gallery/search results toolbar
- `header` - Main header bar
- `settings` - Plugin settings page

---

## Available Hooks

Hooks let your plugin react to LANBooru events.

### onImageScanned

Called when a new image is scanned and added to the database.

```javascript
onImageScanned: async (context, image) => {
  // image: { id, filename, filepath, file_hash, width, height, ... }
  console.log(`New image: ${image.filename}`);
}
```

### onBeforeTagUpdate (Transform Hook)

Called before tags are saved. Return modified tags array. This is a **transform hook** - your output becomes the input for the next plugin, allowing multiple plugins to chain modifications.

```javascript
// Note: tags come BEFORE imageId for transform hooks
onBeforeTagUpdate: async (context, tags, imageId) => {
  // Filter out banned tags
  const banned = ['banned_tag'];
  return tags.filter(t => !banned.includes(t));
}
```

**Chaining example:**
```
Original tags: ["Blue Hair", "banned_tag", "1girl"]
     ↓ Plugin A (formatter)
["blue_hair", "banned_tag", "1girl"]
     ↓ Plugin B (filter)
["blue_hair", "1girl"]
     ↓ Saved to database
```

### onAfterTagUpdate

Called after tags are saved.

```javascript
onAfterTagUpdate: async (context, imageId, tags) => {
  // Sync to external service
  await fetch('https://my-service/sync', {
    method: 'POST',
    body: JSON.stringify({ imageId, tags })
  });
}
```

### onImageDeleted

Called when an image is deleted.

```javascript
onImageDeleted: async (context, imageId) => {
  // Clean up plugin data
  await myPluginDb.delete(imageId);
}
```

### onRouteRegister

Called during startup to register custom Express routes.

```javascript
onRouteRegister: async (context, app) => {
  app.get('/api/my-plugin/stats', (req, res) => {
    res.json({ tagged: 1234 });
  });
}
```

### Hook Context

All hooks receive a `context` object:

```javascript
{
  pluginId: "my-plugin",
  config: {
    threshold: 0.35,
    // ... user-configured values
  }
}
```

---

## API Endpoint Protocol

When a frontend button is clicked, LANBooru sends a request to your plugin:

**Request:**
```
POST /api/plugins/{pluginId}/{endpoint}
Content-Type: application/json
X-Plugin-Config: {"threshold": 0.35, ...}

{
  "imageId": 123,
  "image": {
    "id": 123,
    "filename": "photo.jpg",
    "file_path": "/images/photo.jpg",
    "width": 1920,
    "height": 1080,
    ...
  }
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "tags": ["1girl", "blue_hair", "smile"],
    "confidence": {
      "1girl": 0.95,
      "blue_hair": 0.87,
      "smile": 0.72
    }
  }
}
```

Your plugin config is passed in the `X-Plugin-Config` header.

---

## Packaging Your Plugin

Plugins are distributed as `.lbplugin` files (tar.gz archives).

### Creating a Plugin Package

```bash
# From your plugin directory
tar -czvf my-plugin.lbplugin manifest.json hooks.js docker/
```

Or if your files are in a subdirectory:
```bash
tar -czvf my-plugin.lbplugin -C ./my-plugin .
```

### Installing a Plugin

1. Copy the `.lbplugin` file to `backend/plugins/`
2. Restart LANBooru (or call `/api/plugins/reload` if hot-reload is enabled)

The plugin will be automatically extracted and loaded.

---

## Example: Simple Tag Formatter

A minimal builtin plugin that formats tags:

**manifest.json:**
```json
{
  "id": "tag-formatter",
  "name": "Tag Formatter",
  "version": "1.0.0",
  "description": "Formats tags to booru conventions",
  "type": "builtin",
  "hooks": {
    "backend": "./hooks.js"
  },
  "config": [
    {
      "key": "lowercase",
      "type": "boolean",
      "label": "Convert to lowercase",
      "default": true
    },
    {
      "key": "replaceSpaces",
      "type": "boolean",
      "label": "Replace spaces with underscores",
      "default": true
    }
  ]
}
```

**hooks.js:**
```javascript
module.exports = {
  // Transform hook: tags come before imageId, return modified tags
  onBeforeTagUpdate: async (context, tags, imageId) => {
    const { lowercase, replaceSpaces } = context.config;

    return tags.map(tag => {
      if (lowercase) tag = tag.toLowerCase();
      if (replaceSpaces) tag = tag.replace(/\s+/g, '_');
      return tag;
    });
  }
};
```

**Package it:**
```bash
tar -czvf tag-formatter.lbplugin manifest.json hooks.js
```

---

## Example: AI Tagger Container Plugin

<!-- TODO: Add complete AI tagger example with Python service -->

See the `examples/ai-tagger/` directory for a complete implementation.

---

## Docker Integration

Container plugins are automatically added to LANBooru's Docker Compose configuration.

### Volume Mounts

Container plugins automatically inherit the same image folder mounts as the backend. This means your plugin can access images directly via the file paths provided in hook contexts and API requests.

For example, if LANBooru is configured with:
```yaml
volumes:
  - /home/user/pictures:/images
```

Your container plugin will have the same mount, so `/images/photo.jpg` will resolve to the same file.

### Accessing Images (External Plugins)

External plugins don't have access to the filesystem. Instead, fetch images via HTTP:

```python
# In your external plugin
image_url = f"http://lanbooru-backend:4000/api/images/{image_id}/file"
response = requests.get(image_url)
image_data = response.content
```

The backend URL is accessible within the Docker network as `backend:4000` for container plugins, or you'll need to configure the appropriate URL for external plugins.

---

## Troubleshooting

### Plugin not loading

1. Check the manifest.json is valid JSON
2. Ensure required fields are present (id, name, version, type)
3. Check backend logs for extraction/loading errors

### Hooks not executing

1. Verify the hooks.js path in manifest matches the actual file
2. Check that the function is exported correctly
3. Look for errors in backend logs

### Container not starting

<!-- TODO: Document container troubleshooting -->

### API requests failing

1. Verify the `api.baseUrl` is reachable from the backend container
2. Check the plugin service logs
3. Ensure the endpoint path is correct

---

## Best Practices

1. **Use semantic versioning** for your plugin version
2. **Validate inputs** in your hooks and API endpoints
3. **Handle errors gracefully** - don't crash the host application
4. **Document your config options** with clear descriptions
5. **Test with different image types** (jpg, png, gif, webp, video)
6. **Keep builtin hooks fast** - heavy work should use container plugins
