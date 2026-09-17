package user

import "backend/internal/domain/user/dto"

func toUserResponse(user *User) dto.UserResponse {
	roles := user.Roles
	if roles == nil {
		roles = []string{}
	}
	return dto.UserResponse{
		ID:    user.ID,
		Email: user.Email,
		Name:  user.Name,
		Roles: roles,
		Preferences: dto.PreferencesResponse{
			Theme: user.Preferences.Theme,
		},
		LastLoginAt: user.LastLoginAt,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   user.UpdatedAt,
	}
}

func toUserResponseList(users []*User) []dto.UserResponse {
	result := make([]dto.UserResponse, len(users))
	for i, user := range users {
		result[i] = toUserResponse(user)
	}
	return result
}
