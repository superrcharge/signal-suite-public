package user

import (
	"testing"
	"time"
)

func TestToUserResponse(t *testing.T) {
	now := time.Now()
	user := &User{
		ID:    "550e8400-e29b-41d4-a716-446655440000",
		Email: "test@example.com",
		Name:  "Test User",
		Preferences: Preferences{
			Theme: ThemeDark,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	resp := toUserResponse(user)

	if resp.ID != user.ID {
		t.Errorf("expected ID %s, got %s", user.ID, resp.ID)
	}
	if resp.Email != user.Email {
		t.Errorf("expected Email %s, got %s", user.Email, resp.Email)
	}
	if resp.Name != user.Name {
		t.Errorf("expected Name %s, got %s", user.Name, resp.Name)
	}
	if resp.Preferences.Theme != user.Preferences.Theme {
		t.Errorf("expected Theme %s, got %s", user.Preferences.Theme, resp.Preferences.Theme)
	}
	if !resp.CreatedAt.Equal(user.CreatedAt) {
		t.Errorf("expected CreatedAt %v, got %v", user.CreatedAt, resp.CreatedAt)
	}
	if !resp.UpdatedAt.Equal(user.UpdatedAt) {
		t.Errorf("expected UpdatedAt %v, got %v", user.UpdatedAt, resp.UpdatedAt)
	}
}

func TestToUserResponseList(t *testing.T) {
	now := time.Now()
	users := []*User{
		{
			ID:          "1",
			Email:       "user1@example.com",
			Name:        "User 1",
			Preferences: Preferences{Theme: ThemeLight},
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		{
			ID:          "2",
			Email:       "user2@example.com",
			Name:        "User 2",
			Preferences: Preferences{Theme: ThemeDark},
			CreatedAt:   now,
			UpdatedAt:   now,
		},
	}

	responses := toUserResponseList(users)

	if len(responses) != len(users) {
		t.Fatalf("expected %d responses, got %d", len(users), len(responses))
	}

	for i, resp := range responses {
		if resp.ID != users[i].ID {
			t.Errorf("response[%d]: expected ID %s, got %s", i, users[i].ID, resp.ID)
		}
		if resp.Email != users[i].Email {
			t.Errorf("response[%d]: expected Email %s, got %s", i, users[i].Email, resp.Email)
		}
		if resp.Name != users[i].Name {
			t.Errorf("response[%d]: expected Name %s, got %s", i, users[i].Name, resp.Name)
		}
		if resp.Preferences.Theme != users[i].Preferences.Theme {
			t.Errorf("response[%d]: expected Theme %s, got %s", i, users[i].Preferences.Theme, resp.Preferences.Theme)
		}
	}
}

func TestToUserResponseList_Empty(t *testing.T) {
	responses := toUserResponseList([]*User{})

	if len(responses) != 0 {
		t.Errorf("expected empty slice, got %d items", len(responses))
	}
}

func TestToUserResponseList_Nil(t *testing.T) {
	responses := toUserResponseList(nil)

	if responses == nil {
		t.Error("expected empty slice, got nil")
	}
	if len(responses) != 0 {
		t.Errorf("expected empty slice, got %d items", len(responses))
	}
}
