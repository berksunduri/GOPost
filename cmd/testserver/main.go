package main

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	port := 9876

	// WebSocket echo endpoint
	http.HandleFunc("/ws/echo", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("WS upgrade error: %v", err)
			return
		}
		defer conn.Close()
		log.Printf("[WS] Client connected from %s", r.RemoteAddr)

		// Send a welcome message
		welcome := fmt.Sprintf(`{"type":"welcome","message":"Connected to GoPost test server"}`)
		conn.WriteMessage(websocket.TextMessage, []byte(welcome))

		// Echo loop
		for {
			msgType, msg, err := conn.ReadMessage()
			if err != nil {
				log.Printf("[WS] Client disconnected: %v", err)
				break
			}
			log.Printf("[WS] Received: %s", string(msg))

			// Echo back with a timestamp
			response := fmt.Sprintf(`{"type":"echo","original":%s,"timestamp":"%s"}`,
				string(msg), time.Now().Format(time.RFC3339Nano))
			if err := conn.WriteMessage(msgType, []byte(response)); err != nil {
				log.Printf("[WS] Write error: %v", err)
				break
			}
		}
	})

	// SSE event stream — sends a new event every 2 seconds
	http.HandleFunc("/sse/events", func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming not supported", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		log.Printf("[SSE] Client connected from %s", r.RemoteAddr)

		eventTypes := []string{"message", "update", "alert", "heartbeat"}
		messages := []string{
			`{"user":"alice","action":"login","status":"ok"}`,
			`{"price":42.99,"currency":"USD","change":1.23}`,
			`{"sensor":"temp-01","value":23.5,"unit":"celsius"}`,
			`{"event":"deployment","env":"production","commit":"abc123"}`,
			`{"notification":"New message from Bob","unread":3}`,
		}

		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()

		eventID := 0
		for range ticker.C {
			eventID++
			evtType := eventTypes[rand.Intn(len(eventTypes))]
			msg := messages[rand.Intn(len(messages))]

			fmt.Fprintf(w, "id: %d\n", eventID)
			fmt.Fprintf(w, "event: %s\n", evtType)
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()

			log.Printf("[SSE] Sent event #%d type=%s", eventID, evtType)

			if eventID >= 50 {
				log.Printf("[SSE] Sent 50 events, stopping")
				break
			}
		}
	})

	// Health check
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","server":"gopost-test-server","ws":"/ws/echo","sse":"/sse/events"}`)
	})

	fmt.Printf("\n  GoPost Test Server — WebSocket + SSE Echo\n\n")
	fmt.Printf("  WebSocket echo:  ws://localhost:%d/ws/echo\n", port)
	fmt.Printf("  SSE events:      http://localhost:%d/sse/events\n", port)
	fmt.Printf("  Health check:    http://localhost:%d/health\n\n", port)
	fmt.Printf("  Test in GoPost:\n")
	fmt.Printf("    1. Select WS  → %s → Connect → Send JSON\n", fmt.Sprintf("ws://localhost:%d/ws/echo", port))
	fmt.Printf("    2. Select SSE → %s → Connect → Watch events\n\n", fmt.Sprintf("http://localhost:%d/sse/events", port))

	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), nil); err != nil {
		log.Fatal(err)
	}
}
