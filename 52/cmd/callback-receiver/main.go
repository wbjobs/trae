package main

import (
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func main() {
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	r.POST("/callback", func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			log.Printf("Failed to read callback body: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read body"})
			return
		}
		log.Printf("Received callback: %s", string(body))
		c.JSON(http.StatusOK, gin.H{"status": "received"})
	})

	fmt.Println("Callback receiver running on :9090")
	fmt.Println("Endpoint: POST http://localhost:9090/callback")
	r.Run(":9090")
}
