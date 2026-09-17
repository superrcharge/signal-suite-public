package section

import "backend/internal/domain/section/dto"

func toSectionResponse(sec *Section) dto.SectionResponse {
	return dto.SectionResponse{
		Key:         sec.Key,
		Label:       sec.Label,
		Color:       sec.Color,
		PaceEnabled: sec.PaceEnabled,
	}
}

func toSectionResponseList(sections []*Section) []dto.SectionResponse {
	result := make([]dto.SectionResponse, len(sections))
	for i, sec := range sections {
		result[i] = toSectionResponse(sec)
	}
	return result
}
