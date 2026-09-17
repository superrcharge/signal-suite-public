package contract

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"backend/internal/domain/contract/dto"
	"backend/internal/middleware"
	"backend/internal/shared/csvtable"
	"backend/internal/shared/response"
	"backend/internal/shared/validator"

	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	service   *Service
	validator *validator.Validator
}

func NewHandler(service *Service, validator *validator.Validator) *Handler {
	return &Handler{service: service, validator: validator}
}

func currentUserName(c fiber.Ctx) string {
	u := middleware.GetCurrentUser(c)
	if u == nil {
		return ""
	}
	return u.GetName()
}

func currentUserID(c fiber.Ctx) string {
	u := middleware.GetCurrentUser(c)
	if u == nil {
		return ""
	}
	return u.GetID()
}

func (h *Handler) ListContracts(c fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "30"))

	req := &dto.ListContractsRequest{
		FiscalYear: c.Query("fy"),
		Search:     c.Query("search"),
		Page:       page,
		Limit:      limit,
		SortBy:     c.Query("sort_by"),
		SortDir:    c.Query("sort_dir"),
	}

	resp := &dto.ListContractsResponse{}
	status, err := h.service.ListContracts(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) GetContract(c fiber.Ctx) error {
	req := &dto.GetContractRequest{ID: c.Params("id")}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.GetContractResponse{}
	status, err := h.service.GetContract(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) CreateContract(c fiber.Ctx) error {
	req := &dto.CreateContractRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.CreateContractResponse{}
	status, err := h.service.CreateContract(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) UpdateContract(c fiber.Ctx) error {
	req := &dto.UpdateContractRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(response.Err(err))
	}

	req.ID = c.Params("id")
	req.UpdatedBy = currentUserName(c)
	req.ActorID = currentUserID(c)

	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	resp := &dto.UpdateContractResponse{}
	status, err := h.service.UpdateContract(c.Context(), req, resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) DeleteContract(c fiber.Ctx) error {
	req := &dto.DeleteContractRequest{
		ID:        c.Params("id"),
		ActorID:   currentUserID(c),
		ActorName: currentUserName(c),
	}
	if err := h.validator.Validate(req); err != nil {
		return c.Status(response.StatusFromError(err)).JSON(response.Err(err))
	}

	status, err := h.service.DeleteContract(c.Context(), req, nil)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.SendStatus(status)
}

func (h *Handler) ListFiscalYears(c fiber.Ctx) error {
	resp := &dto.ListFiscalYearsResponse{}
	status, err := h.service.ListFiscalYears(c.Context(), resp)
	if err != nil {
		return c.Status(status).JSON(response.Err(err))
	}
	return c.Status(status).JSON(response.Success(resp))
}

func (h *Handler) ExportContracts(c fiber.Ctx) error {
	fiscalYears := csvtable.ParseList(c.Query("fy"))
	columns := csvtable.ParseList(c.Query("columns"))

	csvContent, err := h.service.ExportContracts(c.Context(), fiscalYears, columns)
	if err != nil {
		if coded, ok := err.(*Error); ok {
			return c.Status(coded.Status).JSON(response.Err(coded))
		}
		return c.Status(http.StatusInternalServerError).JSON(response.Err(err))
	}

	filename := fmt.Sprintf("signal-suite-contracts-%s.csv", time.Now().UTC().Format("20060102"))
	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, filename))
	return c.SendString(csvContent)
}
