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
  "script": "./frontend.js",  // Optional: custom frontend handlers
  "buttons": [ ... ]          // See Button Configuration below
}
```

The `script` field points to a JavaScript file that handles button responses. See [Frontend Scripts](#frontend-scripts) for details.

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
tar -czvf my-plugin.lbplugin manifest.json *.js docker/
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

A complete container plugin example is included with LANBooru at `example-plugins/ai-tagger.lbplugin`.

It demonstrates:
- Python Flask server with ONNX model inference
- GPU support for faster processing
- Video support (extracts frames at 25%, 50%, 75%)
- Automatic model download from HuggingFace
- Frontend script that opens the tag editor with results
- User-configurable thresholds and tag limits

Extract and examine the `.lbplugin` file to see the full implementation.

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
image_url = f"http://lanbooru-backend:4000/api/image/{image_id}/file"
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

1. Check Docker is accessible: `docker version`
2. View container logs: `docker logs plugin-{pluginId}`
3. Verify the network exists: `docker network ls | grep booru`
4. Ensure GPU drivers are installed if `gpu: true` is set
5. Check the Dockerfile builds manually: `docker build -t test ./docker`

### API requests failing

1. Verify the `api.baseUrl` is reachable from the backend container
2. Check the plugin service logs
3. Ensure the endpoint path is correct

---

## Frontend Scripts

Frontend scripts let your plugin execute custom JavaScript in the browser when a button action completes. This enables plugins to interact with the LANBooru UI without modifying core code.

### Basic Structure

**frontend.js:**
```javascript
module.exports = {
  // Called when any button action succeeds
  onSuccess: function(response, api) {
    console.log('Action completed:', response);
  },

  // Called when any button action fails
  onError: function(error, api) {
    api.showMessage('Action failed: ' + error.message, 'error');
  },

  // Per-button handlers (keyed by button id from manifest)
  handlers: {
    'auto-tag': function(response, api) {
      // Handle the auto-tag button specifically
      if (response.success && response.data?.tags) {
        api.openTagEditor(response.data.tags, response.data.tag_mode || 'append');
      }
    }
  }
};
```

### Plugin API

The `api` object passed to handlers provides these methods:

#### `api.openTagEditor(tags, mode)`

Opens the tag editor with the specified tags.

| Parameter | Type | Description |
|-----------|------|-------------|
| `tags` | string[] | Array of tags to populate |
| `mode` | 'append' \| 'replace' | How to handle existing tags (default: 'append') |

```javascript
// Replace all tags
api.openTagEditor(['1girl', 'blue_hair'], 'replace');

// Add to existing tags (avoids duplicates)
api.openTagEditor(['smile', 'outdoors'], 'append');
```

#### `api.showMessage(message, severity)`

Shows a notification message to the user.

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | string | The message to display |
| `severity` | 'success' \| 'error' \| 'warning' \| 'info' | Message type (default: 'info') |

```javascript
api.showMessage('Tags generated successfully!', 'success');
api.showMessage('Could not connect to AI service', 'error');
```

#### `api.refreshImage()`

Refreshes the current image data from the server. Useful after modifying tags or other metadata.

```javascript
// After saving tags via your own API
api.refreshImage();
```

#### `api.navigate(path)`

Navigates to a different page in LANBooru.

```javascript
api.navigate('/');  // Go to home
api.navigate('/image/123');  // Go to specific image
api.navigate('/search?q=blue_hair');  // Search
```

#### `api.getImage()`

Returns the current image data, or `null` if not on an image page.

```javascript
const image = api.getImage();
if (image) {
  console.log('Current image:', image.id, image.filename);
  console.log('Current tags:', image.tags);
  console.log('File path:', image.file_path);
}
```

The image object includes all fields: `id`, `filename`, `file_path`, `file_hash`, `file_type`, `file_size`, `width`, `height`, `tags`, `artist`, `rating`, `source`, `created_at`, `updated_at`, and `duplicates` info.

### Handler Resolution

When a button is clicked and the action succeeds:

1. If `handlers[buttonId]` exists, it's called
2. Otherwise, if `onSuccess` exists, it's called
3. If neither exists, nothing happens (silent success)

For errors:
1. If `onError` exists, it's called
2. Otherwise, the error is logged to console

### Example: AI Tagger Frontend Script

```javascript
// frontend.js for AI tagger plugin
module.exports = {
  handlers: {
    'auto-tag': function(response, api) {
      if (!response.success) {
        api.showMessage('Tagging failed: ' + (response.message || 'Unknown error'), 'error');
        return;
      }

      const data = response.data;
      if (!data?.tags || data.tags.length === 0) {
        api.showMessage('No tags detected in image', 'warning');
        return;
      }

      // Open tag editor with AI-generated tags
      const mode = data.tag_mode || 'append';
      api.openTagEditor(data.tags, mode);

      // Show confidence info
      const tagCount = data.tags.length;
      const topTag = data.tags[0];
      const topConf = data.confidence?.[topTag];
      if (topConf) {
        api.showMessage(
          `Generated ${tagCount} tags. Top: "${topTag}" (${(topConf * 100).toFixed(0)}%)`,
          'success'
        );
      } else {
        api.showMessage(`Generated ${tagCount} tags`, 'success');
      }
    }
  },

  onError: function(error, api) {
    api.showMessage('AI tagging failed: ' + error.message, 'error');
  }
};
```

---

## Best Practices

1. **Use semantic versioning** for your plugin version
2. **Validate inputs** in your hooks and API endpoints
3. **Handle errors gracefully** - don't crash the host application
4. **Document your config options** with clear descriptions
5. **Test with different image types** (jpg, png, gif, webp, video)
6. **Keep builtin hooks fast** - heavy work should use container plugins
7. **Use frontend scripts** to create interactive plugin experiences
8. **Provide user feedback** via `api.showMessage()` for long operations
