package user

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	Create(ctx context.Context, user *User) error
	FindByID(ctx context.Context, id string) (*User, error)
	FindByEmail(ctx context.Context, email string) (*User, error)
	FindByOIDCSubject(ctx context.Context, oidcSubject string) (*User, error)
	FindAll(ctx context.Context, limit, offset int) ([]*User, int, error)
	Count(ctx context.Context) (int, error)
	CountByRole(ctx context.Context, role string) (int, error)
	CountAllByRole(ctx context.Context) (map[string]int, error)
	Update(ctx context.Context, user *User) error
	Upsert(ctx context.Context, user *User) error
	Delete(ctx context.Context, id string) error
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) Create(ctx context.Context, user *User) error {
	rolesJSON, err := json.Marshal(user.Roles)
	if err != nil {
		rolesJSON = []byte("[]")
	}

	query := `
		INSERT INTO users (id, oidc_subject, email, name, roles, preferences_theme, last_login_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err = r.db.Exec(ctx, query,
		user.ID,
		user.OIDCSubject,
		user.Email,
		user.Name,
		rolesJSON,
		user.Preferences.Theme,
		user.LastLoginAt,
		user.CreatedAt,
		user.UpdatedAt,
	)
	return err
}

func (r *PostgresRepository) FindByID(ctx context.Context, id string) (*User, error) {
	query := `
		SELECT id, oidc_subject, email, name, roles, preferences_theme, last_login_at, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	return r.scanUser(ctx, query, id)
}

func (r *PostgresRepository) FindByEmail(ctx context.Context, email string) (*User, error) {
	query := `
		SELECT id, oidc_subject, email, name, roles, preferences_theme, last_login_at, created_at, updated_at
		FROM users
		WHERE email = $1
	`
	return r.scanUser(ctx, query, email)
}

func (r *PostgresRepository) FindByOIDCSubject(ctx context.Context, oidcSubject string) (*User, error) {
	query := `
		SELECT id, oidc_subject, email, name, roles, preferences_theme, last_login_at, created_at, updated_at
		FROM users
		WHERE oidc_subject = $1
	`
	return r.scanUser(ctx, query, oidcSubject)
}

func (r *PostgresRepository) scanUser(ctx context.Context, query string, arg any) (*User, error) {
	user := &User{}
	var rolesJSON []byte
	err := r.db.QueryRow(ctx, query, arg).Scan(
		&user.ID,
		&user.OIDCSubject,
		&user.Email,
		&user.Name,
		&rolesJSON,
		&user.Preferences.Theme,
		&user.LastLoginAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}

	if len(rolesJSON) > 0 {
		if err := json.Unmarshal(rolesJSON, &user.Roles); err != nil {
			user.Roles = []string{}
		}
	} else {
		user.Roles = []string{}
	}

	return user, nil
}

func (r *PostgresRepository) FindAll(ctx context.Context, limit, offset int) ([]*User, int, error) {
	countQuery := `SELECT COUNT(*) FROM users`
	var total int
	if err := r.db.QueryRow(ctx, countQuery).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Sort by most recent login first. NULLS LAST keeps users who have
	// never logged in at the bottom (Postgres sorts NULLs first on DESC by
	// default). created_at DESC is a stable tiebreaker so pagination is
	// deterministic across pages.
	query := `
		SELECT id, oidc_subject, email, name, roles, preferences_theme, last_login_at, created_at, updated_at
		FROM users
		ORDER BY last_login_at DESC NULLS LAST, created_at DESC
		LIMIT $1 OFFSET $2
	`
	rows, err := r.db.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		user := &User{}
		var rolesJSON []byte
		if err := rows.Scan(
			&user.ID,
			&user.OIDCSubject,
			&user.Email,
			&user.Name,
			&rolesJSON,
			&user.Preferences.Theme,
			&user.LastLoginAt,
			&user.CreatedAt,
			&user.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}

		if len(rolesJSON) > 0 {
			if err := json.Unmarshal(rolesJSON, &user.Roles); err != nil {
				user.Roles = []string{}
			}
		} else {
			user.Roles = []string{}
		}

		users = append(users, user)
	}

	return users, total, rows.Err()
}

func (r *PostgresRepository) Count(ctx context.Context) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&count)
	return count, err
}

func (r *PostgresRepository) CountByRole(ctx context.Context, role string) (int, error) {
	var count int
	roleJSON := fmt.Sprintf(`[%q]`, role)
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM users WHERE roles @> $1::jsonb`,
		roleJSON,
	).Scan(&count)
	return count, err
}

// CountAllByRole returns a count per role in one pass, for the Users page
// stat strip. jsonb_array_elements_text unnests the roles array so a user
// holding several roles is counted under each - the counts are therefore
// per-role totals and do not necessarily sum to the number of users.
//
// Roles present in the table but not in ValidRoles are still returned, so a
// stale role left by an older deploy stays visible rather than silently
// vanishing from the totals. Callers overlay ValidRoles to fill in zeros.
func (r *PostgresRepository) CountAllByRole(ctx context.Context) (map[string]int, error) {
	rows, err := r.db.Query(ctx, `
		SELECT role, COUNT(*)
		FROM users, jsonb_array_elements_text(roles) AS role
		GROUP BY role
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make(map[string]int)
	for rows.Next() {
		var role string
		var count int
		if err := rows.Scan(&role, &count); err != nil {
			return nil, err
		}
		counts[role] = count
	}

	return counts, rows.Err()
}

func (r *PostgresRepository) Update(ctx context.Context, user *User) error {
	rolesJSON, err := json.Marshal(user.Roles)
	if err != nil {
		rolesJSON = []byte("[]")
	}

	query := `
		UPDATE users
		SET oidc_subject = $2, email = $3, name = $4, roles = $5, preferences_theme = $6, last_login_at = $7, updated_at = $8
		WHERE id = $1
	`
	result, err := r.db.Exec(ctx, query,
		user.ID,
		user.OIDCSubject,
		user.Email,
		user.Name,
		rolesJSON,
		user.Preferences.Theme,
		user.LastLoginAt,
		user.UpdatedAt,
	)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *PostgresRepository) Upsert(ctx context.Context, user *User) error {
	rolesJSON, err := json.Marshal(user.Roles)
	if err != nil {
		rolesJSON = []byte("[]")
	}

	// On conflict we intentionally do NOT touch the roles column - roles
	// are locally owned (see model.go role constants) and only mutate via
	// explicit admin actions, never from an identity-provider sync.
	query := `
		INSERT INTO users (id, oidc_subject, email, name, roles, preferences_theme, last_login_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (oidc_subject) DO UPDATE SET
			email = EXCLUDED.email,
			name = EXCLUDED.name,
			last_login_at = EXCLUDED.last_login_at,
			updated_at = EXCLUDED.updated_at
		RETURNING id
	`
	return r.db.QueryRow(ctx, query,
		user.ID,
		user.OIDCSubject,
		user.Email,
		user.Name,
		rolesJSON,
		user.Preferences.Theme,
		user.LastLoginAt,
		user.CreatedAt,
		user.UpdatedAt,
	).Scan(&user.ID)
}

func (r *PostgresRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM users WHERE id = $1`
	result, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}
