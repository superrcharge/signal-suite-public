package user

import (
	"context"
	"net/http"
	"reflect"
	"sort"
	"strings"
	"testing"

	"backend/internal/domain/user/dto"
)

// Struct tags cannot be built from a variable, so the `oneof` list on
// UpdateRoleRequest.Role is a hand-maintained copy of ValidRoles. This test is
// what stops the two drifting: adding a role to ValidRoles without updating the
// tag would leave the new role rejected at the API boundary with a confusing
// 400, while removing one from the tag alone would silently keep accepting it.
func TestUpdateRoleTagMatchesValidRoles(t *testing.T) {
	field, ok := reflect.TypeOf(dto.UpdateRoleRequest{}).FieldByName("Role")
	if !ok {
		t.Fatal("UpdateRoleRequest has no Role field")
	}

	var tagged []string
	for _, rule := range strings.Split(field.Tag.Get("validate"), ",") {
		if after, found := strings.CutPrefix(rule, "oneof="); found {
			tagged = strings.Fields(after)
		}
	}
	if tagged == nil {
		t.Fatalf("Role field has no oneof rule; tag is %q", field.Tag.Get("validate"))
	}

	got, want := append([]string(nil), tagged...), append([]string(nil), ValidRoles...)
	sort.Strings(got)
	sort.Strings(want)

	if !reflect.DeepEqual(got, want) {
		t.Errorf("oneof list %v does not match ValidRoles %v", tagged, ValidRoles)
	}
}

// The error message enumerates the accepted roles, so it has to track
// ValidRoles too - a stale list here misleads whoever hits the 400.
func TestErrInvalidRoleListsEveryValidRole(t *testing.T) {
	for _, role := range ValidRoles {
		if !strings.Contains(ErrInvalidRole.Message, role) {
			t.Errorf("ErrInvalidRole message %q omits role %q", ErrInvalidRole.Message, role)
		}
	}
}

func TestListUsers_RoleCounts(t *testing.T) {
	tests := []struct {
		name       string
		repoCounts map[string]int
		want       map[string]int
	}{
		{
			name:       "counts are reported per role",
			repoCounts: map[string]int{"admin": 1, "editor": 4, "viewer": 2, "rto": 3},
			want:       map[string]int{"admin": 1, "editor": 4, "viewer": 2, "rto": 3, "planner": 0},
		},
		{
			// The stat strip needs a stable set of cells, so a role nobody
			// holds must come back as 0 rather than be absent from the map.
			name:       "roles nobody holds are reported as zero",
			repoCounts: map[string]int{"admin": 1},
			want:       map[string]int{"admin": 1, "editor": 0, "viewer": 0, "rto": 0, "planner": 0},
		},
		{
			name:       "empty table reports every role at zero",
			repoCounts: map[string]int{},
			want:       map[string]int{"admin": 0, "editor": 0, "viewer": 0, "rto": 0, "planner": 0},
		},
		{
			// A role left behind by an older deploy stays visible instead of
			// being dropped, so the numbers still explain the user list.
			name:       "unknown roles still present in the table are preserved",
			repoCounts: map[string]int{"admin": 1, "legacy-role": 2},
			want:       map[string]int{"admin": 1, "editor": 0, "viewer": 0, "rto": 0, "planner": 0, "legacy-role": 2},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &MockRepository{
				FindAllFunc: func(context.Context, int, int) ([]*User, int, error) {
					return []*User{}, 0, nil
				},
				CountAllByRoleFunc: func(context.Context) (map[string]int, error) {
					return tt.repoCounts, nil
				},
			}

			resp := &dto.ListUsersResponse{}
			status, err := NewService(repo).ListUsers(
				context.Background(),
				&dto.ListUsersRequest{Limit: 30, Offset: 0},
				resp,
			)

			if err != nil || status != http.StatusOK {
				t.Fatalf("ListUsers returned %d, %v", status, err)
			}
			if !reflect.DeepEqual(resp.RoleCounts, tt.want) {
				t.Errorf("RoleCounts = %v, want %v", resp.RoleCounts, tt.want)
			}
		})
	}
}

// The counts describe the whole table, not the requested page - deriving them
// from resp.Users would understate every role as soon as the list paginates.
func TestListUsers_RoleCountsAreIndependentOfPage(t *testing.T) {
	repo := &MockRepository{
		FindAllFunc: func(context.Context, int, int) ([]*User, int, error) {
			// One user on this page, but 40 in the table.
			return []*User{{ID: "u1", Roles: []string{"admin"}}}, 40, nil
		},
		CountAllByRoleFunc: func(context.Context) (map[string]int, error) {
			return map[string]int{"admin": 2, "editor": 30, "viewer": 8}, nil
		},
	}

	resp := &dto.ListUsersResponse{}
	if _, err := NewService(repo).ListUsers(
		context.Background(),
		&dto.ListUsersRequest{Limit: 1, Offset: 0},
		resp,
	); err != nil {
		t.Fatalf("ListUsers: %v", err)
	}

	if len(resp.Users) != 1 {
		t.Fatalf("expected the page to hold 1 user, got %d", len(resp.Users))
	}
	if resp.RoleCounts["editor"] != 30 {
		t.Errorf("editor count = %d, want 30 - counts must span the table, not the page", resp.RoleCounts["editor"])
	}
	if resp.Total != 40 {
		t.Errorf("Total = %d, want 40", resp.Total)
	}
}

func TestListUsers_RoleCountsError(t *testing.T) {
	repo := &MockRepository{
		FindAllFunc: func(context.Context, int, int) ([]*User, int, error) {
			return []*User{}, 0, nil
		},
		CountAllByRoleFunc: func(context.Context) (map[string]int, error) {
			return nil, context.DeadlineExceeded
		},
	}

	status, err := NewService(repo).ListUsers(
		context.Background(),
		&dto.ListUsersRequest{Limit: 30, Offset: 0},
		&dto.ListUsersResponse{},
	)

	if status != http.StatusInternalServerError || err != ErrUserInternalError {
		t.Errorf("got (%d, %v), want (500, ErrUserInternalError)", status, err)
	}
}
