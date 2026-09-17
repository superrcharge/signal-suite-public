import {
  Box, IconButton, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { IceMark } from '@/components/common';
import { sheetRootProps } from '@/components/common/sheet-export/sheet-root';
import { formatNetFrequency } from '@/types/net-format';
import { NET_RADIO_TYPE_LABELS } from '@/types';
import type { Net } from '@/types';
import { EMPTY_VALUE } from '@/utils';

/**
 * One radio's nets for one squadron, as the Nets Library shows them.
 *
 * Lifted out of nets-page so the print route can draw the same table read
 * only: `canWrite` false drops the Actions column and the "Use Add Net" hint,
 * which is also what a viewer sees on the live page. The container is the
 * sheet root, so share exports exactly this table.
 */
export function NetsTable({ nets, radioLabel, canWrite, onEdit, onDelete, squareTop = false }: {
  nets: Net[];
  /** "JEM" / "MPU5", for the empty-state sentence. */
  radioLabel: string;
  canWrite: boolean;
  onEdit?: (net: Net) => void;
  onDelete?: (net: Net) => void;
  /** Square top corners, for sitting under the live page's folder tabs. */
  squareTop?: boolean;
}) {
  return (
    <TableContainer component={Paper} {...sheetRootProps()} sx={squareTop ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : undefined}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Channel #</TableCell>
            <TableCell>Carried by</TableCell>
            <TableCell>Frequency</TableCell>
            <TableCell align="center">ROIP</TableCell>
            {canWrite && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {nets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canWrite ? 6 : 5}>
                {/* The hint is gated on canWrite: a viewer has no Add Net
                    button in the header, so telling them to press one sends
                    them looking for something that is not there. */}
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  No {radioLabel} nets yet.
                  {canWrite && ' Use Add Net at the top of the page.'}
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            nets.map((net) => (
              <TableRow key={net.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{net.name}</TableCell>
                <TableCell>{net.net_id || EMPTY_VALUE}</TableCell>
                <TableCell>
                  {NET_RADIO_TYPE_LABELS[net.radio_type as keyof typeof NET_RADIO_TYPE_LABELS] ?? net.radio_type}
                </TableCell>
                <TableCell>
                  {formatNetFrequency(net.tx_freq, net.rx_freq, net.freq_unit) || EMPTY_VALUE}
                </TableCell>
                {/* The mark lives in a labelled column rather than beside the
                    name. It carries no words, and not every reader knows it on
                    sight - the ROIP header is what teaches it. */}
                <TableCell align="center">
                  {net.roip ? (
                    <IceMark height={16} />
                  ) : (
                    <Box component="span" sx={{ color: 'text.disabled' }}>{EMPTY_VALUE}</Box>
                  )}
                </TableCell>
                {canWrite && (
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Edit net">
                      <IconButton size="small" onClick={() => onEdit?.(net)} aria-label={`edit ${net.name}`}>
                        <EditIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete net">
                      <IconButton size="small" onClick={() => onDelete?.(net)} aria-label={`delete ${net.name}`}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
