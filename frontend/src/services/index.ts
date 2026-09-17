export { apiClient, ApiClientError } from './api-client';
export { queryClient, queryKeys } from './query-client';
export { useUsers, useUpdateUserPreferences, useUpdateUserRole } from './user-service';
export {
  useCurrentUser,
  useLogout,
} from './auth-service';
export {
  useSections,
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
  REASSIGN_TO_NONE,
} from './section-service';
export type { UpdateSectionRequest, DeleteSectionResponse } from './section-service';
export {
  useTerminals,
  useTerminal,
  useTerminalTags,
  useCreateTerminal,
  useUpdateTerminal,
  useDeleteTerminal,
} from './terminal-service';
export {
  useKits,
  useKit,
  useCreateKit,
  useUpdateKit,
  useDeleteKit,
} from './kit-service';
export { useAuditEvents } from './audit-service';
export type { AuditEvent, ListEventsParams } from './audit-service';
export { useTags, useCreateTag, useDeleteTag } from './tag-service';
export {
  useContracts,
  useContractFiscalYears,
  useCreateContract,
  useUpdateContract,
  useDeleteContract,
} from './contract-service';
export {
  useEquipment,
  useEquipmentItem,
  useCreateEquipment,
  useUpdateEquipment,
  useDeleteEquipment,
  useUploadEquipmentPhoto,
} from './equipment-service';
export type { ListEquipmentParams } from './equipment-service';
export {
  useWaveforms,
  useWaveformUsage,
  useCreateWaveform,
  useUpdateWaveform,
  useDeleteWaveform,
} from './waveform-service';

export {
  useServices,
  useServiceUsage,
  useCreateService,
  useUpdateService,
  useDeleteService,
} from './service-library';

export {
  useTransports,
  useCreateTransport,
  useUpdateTransport,
  useDeleteTransport,
} from './transport-service';

export {
  usePlatforms,
  useCreatePlatform,
  useUpdatePlatform,
  useDeletePlatform,
} from './platform-service';

export {
  useNets,
  useCreateNet,
  useUpdateNet,
  useDeleteNet,
} from './net-service';

export {
  usePaceCard,
  useSavePaceCard,
  useUploadPaceEmblem,
  useDeletePaceEmblem,
} from './pace-service';
