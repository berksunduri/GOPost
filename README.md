# GoPost - Postman Clone Built with Go

A lightweight, educational Postman clone built with Go.

![GoPost](https://img.shields.io/badge/GoPost-v1.0-blue)
![Go](https://img.shields.io/badge/Go-1.21+-00ADD8?logo=go)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

✨ **Core Features:**
- 📦 **Collections Management** - Organize requests into collections
- 🔗 **HTTP Requests** - Build and send GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS requests
- 🏷️ **Headers Management** - Add custom headers to requests
- 📝 **Request Body** - Support for JSON and text request bodies
- 🌍 **Environments** - Create and manage different environment configurations
- 💾 **File-Based Storage** - All data stored as JSON files locally
- 🎨 **Modern UI** - Clean, dark-themed web interface
- 📊 **Response Formatting** - Pretty-print JSON responses
- ⏱️ **Performance Metrics** - Track request execution time

## Project Structure

```
GoPost/
├── main.go                 # Entry point and server setup
├── go.mod                  # Go module file
├── pkg/
│   ├── models/
│   │   └── models.go       # Data structures (Collection, Request, Environment, etc.)
│   ├── handlers/
│   │   └── handlers.go     # HTTP request handlers and routes
│   └── storage/
│       └── storage.go      # File-based data persistence
├── frontend/
│   ├── index.html          # Main UI interface
│   └── app.js              # Frontend JavaScript logic
├── data/                   # JSON storage directory
│   ├── collections.json
│   ├── requests.json
│   └── environments.json
└── README.md               # This file
```

## Installation & Setup

### Prerequisites
- Go 1.21 or higher
- Any modern web browser

### Build & Run

1. **Clone or navigate to the project directory:**

2. **Install external dependency:**
   ```bash
   go get github.com/google/uuid
   ```

3. **Build the application:**
   ```bash
   go build -o gopost .
   ```

4. **Run the server:**
   ```bash
   ./gopost
   ```

   OR use:
   ```bash
   go run main.go
   ```

5. **Open in browser:**
   - The server will start on an available port (default around 8080)
   - Check the console output for the exact URL
   - Open `http://localhost:<port>` in your browser

## Usage Guide

### Creating a Collection
1. Click the **+** button next to "Collections" in the sidebar
2. Enter a collection name
3. Click "Create"

### Building a Request
1. Select a collection from the sidebar
2. Select HTTP method (GET, POST, PUT, etc.)
3. Enter the request URL
4. (Optional) Add headers in the Headers tab
5. (Optional) Add request body in the Body tab
6. Click **Send** to execute

### Saving Requests
1. After configuring a request, click **Save Request**
2. Enter a name for the request
3. Select the target collection
4. (Optional) Add description
5. Click **Save**

### Creating Environments
1. Click the **+** button next to "Environments" in the sidebar
2. Enter an environment name (e.g., "Development", "Production")
3. Click **Create**
4. Use environments to store different configurations

### Viewing Responses
1. Click the **Response** tab after sending a request
2. View status code, headers, and formatted response body
3. Response time is displayed for performance tracking

## API Endpoints

The backend provides the following REST API endpoints:

### Collections
- `GET /api/collections` - List all collections
- `POST /api/collections/create` - Create new collection
- `GET /api/collections/{id}` - Get collection details
- `PUT /api/collections/{id}` - Update collection
- `DELETE /api/collections/{id}` - Delete collection

### Requests
- `GET /api/collections/{id}/requests` - List requests in collection
- `POST /api/collections/{id}/requests/create` - Create request
- `PUT /api/requests/{id}` - Update request
- `DELETE /api/requests/{id}` - Delete request
- `POST /api/requests/{id}/execute` - Execute request

### Environments
- `GET /api/environments` - List all environments
- `POST /api/environments` - Create environment
- `DELETE /api/environments/{id}` - Delete environment

## Data Storage

All data is stored as JSON files in the `data/` directory:

- **collections.json** - Collection definitions
- **requests.json** - HTTP requests
- **environments.json** - Environment configurations

## Learning Opportunities

This project is perfect for learning:

1. **Go Fundamentals**
   - HTTP server with `net/http`
   - File I/O and JSON marshaling/unmarshaling
   - Goroutines and concurrency (via `sync.RWMutex`)
   - Error handling and validation

2. **REST API Design**
   - RESTful endpoint design
   - HTTP method handling
   - Request/response formatting
   - CORS and middleware

3. **Web Development**
   - HTML/CSS/JavaScript
   - DOM manipulation
   - Fetch API for client-server communication
   - Modal dialogs and UI state management

4. **Software Architecture**
   - Package organization
   - Separation of concerns (models, handlers, storage)
   - Data persistence patterns
   - Handler function design

## Example: Creating Your First Request

1. Start the server: `go run main.go`
2. Open browser to `http://localhost:<port>`
3. Create a collection called "Public APIs"
4. In the URL field, enter: `https://api.github.com/users/golang`
5. Change header `User-Agent` to `GoPost-Client`
6. Click **Send**
7. View the JSON response in the Response tab

## Tips & Tricks

- **Quick Testing**: Use public APIs like JSONPlaceholder, OpenWeatherMap, or GitHub API
- **Headers**: Common headers are `Content-Type: application/json` and `Authorization`
- **Request Bodies**: Format JSON properly for POST/PUT requests
- **CORS**: Note that browser CORS policies may restrict requests to certain domains
- **Environment Testing**: Create separate environments for dev/staging/prod URLs

## Troubleshooting

### Server won't start
- Ensure port is not in use
- Check Go installation: `go version`
- Try running with: `go run main.go`

### Frontend won't load
- Clear browser cache (Ctrl+Shift+Delete / Cmd+Shift+Delete)
- Check DevTools console for errors
- Verify API URL matches server port

### Requests failing with CORS
- This is a browser security feature
- Works fine for same-origin API calls
- Can disable CORS restrictions in some browsers for testing

### Data not persisting
- Ensure `data/` directory is writable
- Check file permissions
- Verify JSON file integrity manually

## Future Enhancement Ideas

- 🔓 Authentication/Bearer token support
- 🔐 Environment variable encryption
- 📤 Import/Export collections
- 🔢 Request history and replay
- 📚 API documentation generation
- 🎯 Request templates and variables
- 🧪 Test assertions and automation
- 📊 Request analytics and statistics
- 🔄 Request scheduling
- 🚀 WebSocket support

## Development Commands

```bash
# Build executable
go build -o gopost .

# Run with go run
go run main.go

# Run tests
go test ./...

# Format code
go fmt ./...

# Run linter
go vet ./...

# Check dependencies
go mod tidy
```

## Project Stats

- **Language**: Go + HTML/CSS/JavaScript
- **Lines of Code**: ~1000+
- **Packages Used**: github.com/google/uuid
- **Storage Backend**: JSON files
- **UI Framework**: Vanilla JavaScript (no dependencies)

## License

MIT License - Feel free to use, modify, and distribute!

## Contributing

Want to improve GoPost? You can:

1. Add new features (WebSocket support, authentication, etc.)
2. Improve the UI/UX
3. Optimize performance
4. Add more test coverage
5. Improve documentation

## Support & Questions

If you have questions or issues:
1. Check the troubleshooting section
2. Review code comments
3. Test with public APIs first
4. Check your browser's DevTools console

---

**Happy Testing! 🚀**

Built with ❤️ for learning Go development.
