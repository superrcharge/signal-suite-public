package dto

type OrganizationResponse struct {
	Key        string `json:"key"`
	Name       string `json:"name"`
	ShortLabel string `json:"short_label"`
	// Branch and SectionKey are "" when unset, never null.
	Branch     string `json:"branch"`
	Color      string `json:"color"`
	SectionKey string `json:"section_key"`
	Notes      string `json:"notes"`
	CreatedBy  string `json:"created_by"`
	UpdatedBy  string `json:"updated_by"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
	// OperationCount is how many distinct operations have this organization
	// checked in, computed on read. It lets a client disable Delete before the
	// server's ORGANIZATION_IN_USE arrives. Never null; 0 when unused.
	OperationCount int `json:"operation_count"`
}

type CreateOrganizationResponse struct {
	Organization OrganizationResponse `json:"organization"`
}

type UpdateOrganizationResponse struct {
	Organization OrganizationResponse `json:"organization"`
}

type ListOrganizationsResponse struct {
	Organizations []OrganizationResponse `json:"organizations"`
	Total         int                    `json:"total"`
}
