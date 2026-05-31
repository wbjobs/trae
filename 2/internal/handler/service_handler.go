package handler

import (
	"net/http"

	"github.com/distributed-scheduler/internal/service"
	"github.com/gin-gonic/gin"
)

type ServiceHandler struct{}

func NewServiceHandler() *ServiceHandler {
	return &ServiceHandler{}
}

func (h *ServiceHandler) GetServices(c *gin.Context) {
	services := service.GetAllServices()

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    services,
	})
}

func (h *ServiceHandler) GetSchedulers(c *gin.Context) {
	schedulers, err := service.GetServices(service.ServiceTypeScheduler)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get schedulers: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    schedulers,
	})
}

func (h *ServiceHandler) GetExecutors(c *gin.Context) {
	executors, err := service.GetServices(service.ServiceTypeExecutor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get executors: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    executors,
	})
}
