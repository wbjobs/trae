package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"time"

	"data-cleanse-service/internal/models"
)

func main() {
	rand.Seed(time.Now().UnixNano())

	records := make([]models.UserRecord, 1000)
	names := []string{"张三", "李四", "王五", "赵六", "钱七", "孙八", "周九", "吴十", "", "invalid"}

	for i := 0; i < 1000; i++ {
		record := models.UserRecord{
			UserID:   fmt.Sprintf("user_%06d", i+1),
			Username: names[rand.Intn(len(names))],
			Email:    fmt.Sprintf("user%d@example.com", i+1),
			Phone:    fmt.Sprintf("138%08d", i+1),
			Age:      rand.Intn(100),
		}

		if rand.Intn(10) == 0 {
			record.Email = fmt.Sprintf("invalid-email-%d", i)
		}
		if rand.Intn(15) == 0 {
			record.Phone = fmt.Sprintf("invalid-%d", i)
		}
		if rand.Intn(20) == 0 {
			record.Age = rand.Intn(200) - 50
		}

		records[i] = record
	}

	priority := "medium"
	if len(os.Args) > 1 {
		priority = os.Args[1]
	}

	request := map[string]interface{}{
		"request_id":   fmt.Sprintf("req-test-%s-%d", priority, time.Now().Unix()),
		"priority":     priority,
		"callback_url": "http://localhost:9090/callback",
		"records":      records,
	}

	data, err := json.MarshalIndent(request, "", "  ")
	if err != nil {
		fmt.Printf("Error marshaling: %v\n", err)
		os.Exit(1)
	}

	err = os.WriteFile("test-request.json", data, 0644)
	if err != nil {
		fmt.Printf("Error writing file: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Test data generated: test-request.json")
	fmt.Println("To submit: curl -X POST http://localhost:8080/api/v1/tasks -H 'Content-Type: application/json' -d @test-request.json")
}
