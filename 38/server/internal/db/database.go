package db

import (
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Init(dsn string) error {
	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return err
	}

	log.Println("Database connected successfully")
	return nil
}

func AutoMigrate() error {
	err := DB.AutoMigrate(
		&User{},
		&Card{},
		&PermissionGroup{},
		&TimeRule{},
		&AccessLog{},
		&Door{},
		&BlacklistedCard{},
		&SuspiciousCard{},
	)
	if err != nil {
		return err
	}

	log.Println("Database migration completed")
	return nil
}

func SeedDefaultData(adminUsername, adminPassword string) error {
	var count int64
	DB.Model(&User{}).Where("role = ?", "admin").Count(&count)
	if count == 0 {
		admin := User{
			Username: adminUsername,
			Password: adminPassword,
			Name:     "系统管理员",
			Role:     "admin",
		}
		if err := DB.Create(&admin).Error; err != nil {
			log.Printf("Failed to create admin user: %v", err)
		} else {
			log.Println("Default admin user created")
		}
	}

	var pgCount int64
	DB.Model(&PermissionGroup{}).Where("name = ?", "默认权限组").Count(&pgCount)
	if pgCount == 0 {
		defaultGroup := PermissionGroup{
			Name:        "默认权限组",
			Description: "默认权限组，允许工作日9:00-18:00访问",
		}
		if err := DB.Create(&defaultGroup).Error; err == nil {
			weekdayRules := []TimeRule{}
			for day := int32(1); day <= 5; day++ {
				weekdayRules = append(weekdayRules, TimeRule{
					PermissionGroupID: defaultGroup.ID,
					DayOfWeek:         day,
					StartTime:         "09:00",
					EndTime:           "18:00",
				})
			}
			for _, rule := range weekdayRules {
				DB.Create(&rule)
			}
			log.Println("Default permission group created")
		}
	}

	var doorCount int64
	DB.Model(&Door{}).Count(&doorCount)
	if doorCount == 0 {
		defaultDoors := []Door{
			{Name: "正门", Location: "1楼大厅", Status: "online"},
			{Name: "后门", Location: "1楼后门", Status: "online"},
			{Name: "服务器机房", Location: "3楼机房", Status: "online"},
			{Name: "财务室", Location: "2楼财务区", Status: "online"},
		}
		for _, door := range defaultDoors {
			DB.Create(&door)
		}
		log.Println("Default doors created")
	}

	return nil
}
