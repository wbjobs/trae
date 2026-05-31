package geo

import (
	"math"
	"net"
	"sync"
	"time"
)

type Location struct {
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type IPGeolocation struct {
	IPNet    *net.IPNet
	Location Location
}

type ClientGeoHistory struct {
	ClientCN    string    `json:"client_cn"`
	LastIP      string    `json:"last_ip"`
	LastLoc     Location  `json:"last_location"`
	LastSeen    time.Time `json:"last_seen"`
	CurrentIP   string    `json:"current_ip"`
	CurrentLoc  Location  `json:"current_location"`
	CurrentTime time.Time `json:"current_time"`
}

type RiskAssessment struct {
	ClientCN        string    `json:"client_cn"`
	SourceIP        string    `json:"source_ip"`
	Location        Location  `json:"location"`
	LastIP          string    `json:"last_ip"`
	LastLocation    Location  `json:"last_location"`
	LastSeen        time.Time `json:"last_seen"`
	DistanceKM      float64   `json:"distance_km"`
	TimeDeltaMin    float64   `json:"time_delta_min"`
	ImpossibleSpeed float64   `json:"impossible_speed_kmh"`
	IsNewLocation   bool      `json:"is_new_location"`
	IsRisky         bool      `json:"is_risky"`
	RiskLevel       string    `json:"risk_level"`
	RiskReason      string    `json:"risk_reason"`
}

const (
	maxSpeedKMH    = 1000.0
	minDistanceKM  = 300.0
	riskTimeWindow = 60 * time.Minute
)

var knownLocations = []Location{
	{"Beijing", 39.9042, 116.4074},
	{"Shanghai", 31.2304, 121.4737},
	{"Guangzhou", 23.1291, 113.2644},
	{"Shenzhen", 22.5431, 114.0579},
	{"Chengdu", 30.5728, 104.0668},
	{"Hangzhou", 30.2741, 120.1551},
	{"Nanjing", 32.0603, 118.7969},
	{"Wuhan", 30.5928, 114.3055},
	{"Xian", 34.3416, 108.9398},
	{"Chongqing", 29.5630, 106.5516},
	{"Tianjin", 39.3434, 117.3616},
	{"Hong Kong", 22.3193, 114.1694},
	{"Taipei", 25.0330, 121.5654},
	{"Tokyo", 35.6762, 139.6503},
	{"Seoul", 37.5665, 126.9780},
	{"Singapore", 1.3521, 103.8198},
	{"London", 51.5074, -0.1278},
	{"New York", 40.7128, -74.0060},
	{"San Francisco", 37.7749, -122.4194},
	{"Los Angeles", 34.0522, -118.2437},
	{"Seattle", 47.6062, -122.3321},
	{"Frankfurt", 50.1109, 8.6821},
	{"Paris", 48.8566, 2.3522},
	{"Sydney", -33.8688, 151.2093},
	{"Mumbai", 19.0760, 72.8777},
	{"Dubai", 25.2048, 55.2708},
	{"Unknown", 0.0, 0.0},
}

var ipGeolocations = []IPGeolocation{
	{mustParseCIDR("1.0.1.0/24"), Location{"Fujian", 26.0745, 119.2965}},
	{mustParseCIDR("1.0.2.0/23"), Location{"Guangdong", 23.1291, 113.2644}},
	{mustParseCIDR("1.0.8.0/21"), Location{"Guangdong", 23.1291, 113.2644}},
	{mustParseCIDR("1.0.32.0/19"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("1.1.0.0/24"), Location{"Fujian", 26.0745, 119.2965}},
	{mustParseCIDR("1.2.0.0/16"), Location{"Jiangsu", 32.0603, 118.7969}},
	{mustParseCIDR("1.4.0.0/16"), Location{"Jiangsu", 32.0603, 118.7969}},
	{mustParseCIDR("1.8.0.0/13"), Location{"Guangdong", 23.1291, 113.2644}},
	{mustParseCIDR("10.0.0.0/8"), Location{"Internal", 39.9042, 116.4074}},
	{mustParseCIDR("14.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("14.102.0.0/15"), Location{"Shanghai", 31.2304, 121.4737}},
	{mustParseCIDR("27.0.0.0/13"), Location{"Shanghai", 31.2304, 121.4737}},
	{mustParseCIDR("36.0.0.0/13"), Location{"Zhejiang", 30.2741, 120.1551}},
	{mustParseCIDR("39.0.0.0/13"), Location{"Hebei", 39.3434, 117.3616}},
	{mustParseCIDR("42.0.0.0/16"), Location{"Jilin", 43.8868, 125.3245}},
	{mustParseCIDR("43.0.0.0/16"), Location{"Jilin", 43.8868, 125.3245}},
	{mustParseCIDR("45.0.0.0/13"), Location{"Guangdong", 23.1291, 113.2644}},
	{mustParseCIDR("49.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("58.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("61.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("101.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("110.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("112.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("114.0.0.0/13"), Location{"Shanghai", 31.2304, 121.4737}},
	{mustParseCIDR("116.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("117.0.0.0/13"), Location{"Tianjin", 39.3434, 117.3616}},
	{mustParseCIDR("118.0.0.0/13"), Location{"Shanghai", 31.2304, 121.4737}},
	{mustParseCIDR("119.0.0.0/13"), Location{"Zhejiang", 30.2741, 120.1551}},
	{mustParseCIDR("120.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("121.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("122.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("123.0.0.0/13"), Location{"Liaoning", 41.8057, 123.4315}},
	{mustParseCIDR("124.0.0.0/13"), Location{"Liaoning", 41.8057, 123.4315}},
	{mustParseCIDR("125.0.0.0/13"), Location{"Jilin", 43.8868, 125.3245}},
	{mustParseCIDR("172.16.0.0/12"), Location{"Internal", 39.9042, 116.4074}},
	{mustParseCIDR("183.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("192.168.0.0/16"), Location{"Internal", 39.9042, 116.4074}},
	{mustParseCIDR("202.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("210.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("218.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
	{mustParseCIDR("220.0.0.0/13"), Location{"Beijing", 39.9042, 116.4074}},
}

func mustParseCIDR(cidr string) *net.IPNet {
	_, ipNet, err := net.ParseCIDR(cidr)
	if err != nil {
		panic("invalid CIDR: " + cidr)
	}
	return ipNet
}

type GeoTracker struct {
	mu       sync.RWMutex
	history  map[string]*ClientGeoHistory
}

func NewGeoTracker() *GeoTracker {
	return &GeoTracker{
		history: make(map[string]*ClientGeoHistory),
	}
}

func (gt *GeoTracker) Lookup(ipStr string) Location {
	ip := net.ParseIP(extractIP(ipStr))
	if ip == nil {
		return knownLocations[len(knownLocations)-1]
	}

	for _, geo := range ipGeolocations {
		if geo.IPNet.Contains(ip) {
			return geo.Location
		}
	}

	return knownLocations[len(knownLocations)-1]
}

func (gt *GeoTracker) AssessRisk(clientCN, sourceIP string) RiskAssessment {
	currentLoc := gt.Lookup(sourceIP)
	now := time.Now()

	gt.mu.RLock()
	hist, exists := gt.history[clientCN]
	gt.mu.RUnlock()

	assessment := RiskAssessment{
		ClientCN:   clientCN,
		SourceIP:   extractIP(sourceIP),
		Location:   currentLoc,
		CurrentIP:  extractIP(sourceIP),
		CurrentLoc: currentLoc,
		CurrentTime: now,
		RiskLevel:  "low",
	}

	if !exists {
		assessment.IsNewLocation = true
		assessment.RiskReason = "first login from this IP"
		return assessment
	}

	assessment.LastIP = hist.LastIP
	assessment.LastLocation = hist.LastLoc
	assessment.LastSeen = hist.LastSeen

	if extractIP(sourceIP) == hist.LastIP {
		assessment.RiskReason = "same IP as previous login"
		return assessment
	}

	distance := haversineDistance(hist.LastLoc.Latitude, hist.LastLoc.Longitude,
		currentLoc.Latitude, currentLoc.Longitude)
	assessment.DistanceKM = distance

	timeDelta := now.Sub(hist.LastSeen).Minutes()
	assessment.TimeDeltaMin = timeDelta

	if timeDelta > 0 {
		speed := distance / (timeDelta / 60.0)
		assessment.ImpossibleSpeed = speed

		if distance > minDistanceKM && timeDelta < float64(riskTimeWindow.Minutes()) {
			assessment.IsRisky = true
			assessment.RiskLevel = "high"
			assessment.RiskReason = "geo-mutation detected"
		} else if distance > minDistanceKM/2 && timeDelta < float64(riskTimeWindow.Minutes())*2 {
			assessment.RiskLevel = "medium"
			assessment.RiskReason = "unusual location change"
		} else {
			assessment.RiskReason = "location changed within normal parameters"
		}
	}

	return assessment
}

func (gt *GeoTracker) RecordLogin(clientCN, sourceIP string) {
	loc := gt.Lookup(sourceIP)
	now := time.Now()

	gt.mu.Lock()
	defer gt.mu.Unlock()

	if hist, exists := gt.history[clientCN]; exists {
		hist.LastIP = hist.CurrentIP
		hist.LastLoc = hist.CurrentLoc
		hist.LastSeen = hist.CurrentTime
		hist.CurrentIP = extractIP(sourceIP)
		hist.CurrentLoc = loc
		hist.CurrentTime = now
	} else {
		gt.history[clientCN] = &ClientGeoHistory{
			ClientCN:    clientCN,
			CurrentIP:   extractIP(sourceIP),
			CurrentLoc:  loc,
			CurrentTime: now,
		}
	}
}

func (gt *GeoTracker) GetHistory(clientCN string) (*ClientGeoHistory, bool) {
	gt.mu.RLock()
	defer gt.mu.RUnlock()
	hist, ok := gt.history[clientCN]
	if !ok {
		return nil, false
	}
	result := *hist
	return &result, true
}

func (gt *GeoTracker) GetAllHistory() []ClientGeoHistory {
	gt.mu.RLock()
	defer gt.mu.RUnlock()

	result := make([]ClientGeoHistory, 0, len(gt.history))
	for _, h := range gt.history {
		result = append(result, *h)
	}
	return result
}

func (gt *GeoTracker) ClearHistory(clientCN string) {
	gt.mu.Lock()
	defer gt.mu.Unlock()
	delete(gt.history, clientCN)
}

func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusKM = 6371.0

	lat1Rad := lat1 * math.Pi / 180
	lat2Rad := lat2 * math.Pi / 180
	deltaLat := (lat2 - lat1) * math.Pi / 180
	deltaLon := (lon2 - lon1) * math.Pi / 180

	a := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*
			math.Sin(deltaLon/2)*math.Sin(deltaLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusKM * c
}

func extractIP(addr string) string {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	return host
}
