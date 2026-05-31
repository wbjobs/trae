package main

import (
	"math"
	"math/rand"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type ParticleConfig struct {
	Distribution string   `json:"distribution"`
	ColorTheme   string   `json:"colorTheme"`
	Count        int      `json:"count"`
	Particles    []Particle `json:"particles"`
}

type Particle struct {
	Position [3]float64 `json:"position"`
	Color    [3]float64 `json:"color"`
	Velocity [3]float64 `json:"velocity"`
}

type ConfigRequest struct {
	Distribution string `json:"distribution" binding:"oneof=sphere cube disk galaxy"`
	ColorTheme   string `json:"colorTheme" binding:"oneof=rainbow fire ocean nebula pastel"`
	Count        int    `json:"count" binding:"min=1000,max=200000"`
}

var colorThemes = map[string][][3]float64{
	"rainbow": {
		{1.0, 0.0, 0.0},
		{1.0, 0.5, 0.0},
		{1.0, 1.0, 0.0},
		{0.0, 1.0, 0.0},
		{0.0, 0.0, 1.0},
		{0.5, 0.0, 1.0},
		{1.0, 0.0, 1.0},
	},
	"fire": {
		{1.0, 0.0, 0.0},
		{1.0, 0.3, 0.0},
		{1.0, 0.6, 0.0},
		{1.0, 0.8, 0.0},
		{1.0, 1.0, 0.5},
	},
	"ocean": {
		{0.0, 0.2, 0.5},
		{0.0, 0.4, 0.7},
		{0.0, 0.6, 0.9},
		{0.2, 0.8, 1.0},
		{0.5, 1.0, 1.0},
	},
	"nebula": {
		{0.5, 0.0, 0.8},
		{0.8, 0.0, 0.6},
		{1.0, 0.2, 0.4},
		{0.6, 0.0, 0.9},
		{0.3, 0.0, 0.7},
	},
	"pastel": {
		{1.0, 0.7, 0.8},
		{0.7, 0.9, 1.0},
		{0.8, 1.0, 0.7},
		{1.0, 0.9, 0.7},
		{0.9, 0.7, 1.0},
	},
}

func main() {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	r.GET("/api/config", getDefaultConfig)
	r.POST("/api/config", generateConfig)
	r.GET("/api/distributions", getDistributions)
	r.GET("/api/themes", getColorThemes)

	r.Run(":8080")
}

func getDefaultConfig(c *gin.Context) {
	config := generateParticleConfig("sphere", "rainbow", 100000)
	c.JSON(http.StatusOK, config)
}

func generateConfig(c *gin.Context) {
	var req ConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Count == 0 {
		req.Count = 100000
	}

	config := generateParticleConfig(req.Distribution, req.ColorTheme, req.Count)
	c.JSON(http.StatusOK, config)
}

func getDistributions(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"distributions": []string{"sphere", "cube", "disk", "galaxy"},
	})
}

func getColorThemes(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"themes": []string{"rainbow", "fire", "ocean", "nebula", "pastel"},
	})
}

func generateParticleConfig(distribution, colorTheme string, count int) ParticleConfig {
	rand.Seed(time.Now().UnixNano())
	particles := make([]Particle, count)
	colors := colorThemes[colorTheme]

	for i := 0; i < count; i++ {
		pos := generatePosition(distribution, float64(i)/float64(count))
		color := interpolateColor(colors, float64(i)/float64(count))
		vel := generateVelocity(pos, distribution)

		particles[i] = Particle{
			Position: pos,
			Color:    color,
			Velocity: vel,
		}
	}

	return ParticleConfig{
		Distribution: distribution,
		ColorTheme:   colorTheme,
		Count:        count,
		Particles:    particles,
	}
}

func generatePosition(distribution string, t float64) [3]float64 {
	switch distribution {
	case "sphere":
		return randomSpherePoint(5.0)
	case "cube":
		return randomCubePoint(4.0)
	case "disk":
		return randomDiskPoint(5.0, 0.5)
	case "galaxy":
		return galaxyPoint(t)
	default:
		return randomSpherePoint(5.0)
	}
}

func randomSpherePoint(radius float64) [3]float64 {
	u := rand.Float64()
	v := rand.Float64()
	theta := 2 * math.Pi * u
	phi := math.Acos(2*v - 1)
	r := radius * math.Cbrt(rand.Float64())

	x := r * math.Sin(phi) * math.Cos(theta)
	y := r * math.Sin(phi) * math.Sin(theta)
	z := r * math.Cos(phi)

	return [3]float64{x, y, z}
}

func randomCubePoint(size float64) [3]float64 {
	x := (rand.Float64() - 0.5) * size * 2
	y := (rand.Float64() - 0.5) * size * 2
	z := (rand.Float64() - 0.5) * size * 2
	return [3]float64{x, y, z}
}

func randomDiskPoint(radius, height float64) [3]float64 {
	angle := rand.Float64() * 2 * math.Pi
	r := radius * math.Sqrt(rand.Float64())
	x := r * math.Cos(angle)
	z := r * math.Sin(angle)
	y := (rand.Float64() - 0.5) * height * 2
	return [3]float64{x, y, z}
}

func galaxyPoint(t float64) [3]float64 {
	arm := int(t * 4) % 4
	armAngle := float64(arm) * math.Pi * 0.5
	spin := t * math.Pi * 4

	r := 0.5 + rand.Float64()*4.5
	angle := armAngle + spin + rand.NormFloat64()*0.3

	x := r * math.Cos(angle)
	z := r * math.Sin(angle)
	y := rand.NormFloat64() * 0.3

	return [3]float64{x, y, z}
}

func interpolateColor(colors [][3]float64, t float64) [3]float64 {
	if len(colors) == 1 {
		return colors[0]
	}

	scaledT := t * float64(len(colors)-1)
	index := int(scaledT)
	frac := scaledT - float64(index)

	if index >= len(colors)-1 {
		return colors[len(colors)-1]
	}

	c1 := colors[index]
	c2 := colors[index+1]

	return [3]float64{
		c1[0] + (c2[0]-c1[0])*frac,
		c1[1] + (c2[1]-c1[1])*frac,
		c1[2] + (c2[2]-c1[2])*frac,
	}
}

func generateVelocity(pos [3]float64, distribution string) [3]float64 {
	speed := 0.5
	switch distribution {
	case "galaxy":
		r := math.Sqrt(pos[0]*pos[0] + pos[2]*pos[2])
		if r > 0.1 {
			angle := math.Atan2(pos[2], pos[0])
			speed = 1.0 / (r + 0.5)
			return [3]float64{
				-math.Sin(angle) * speed,
				0,
				math.Cos(angle) * speed,
			}
		}
		return [3]float64{0, 0, 0}
	default:
		angle := math.Atan2(pos[2], pos[0])
		return [3]float64{
			-math.Sin(angle) * speed * 0.3,
			(rand.Float64() - 0.5) * 0.1,
			math.Cos(angle) * speed * 0.3,
		}
	}
}
