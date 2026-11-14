import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HardDriveUpload } from 'lucide-react';
import { useGame } from '../../app/GameProvider.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.tsx';
import { Notice } from '../../components/ui/Notice.tsx';

/**
 * Offers to move a character saved in this browser before accounts existed (Phase 1) into the
 * player's account. Shown only when the account has no character yet.
 */
export function LocalImportBanner() {
  const { localImport, importLocal, discardLocal } = useGame();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (!localImport) return null;

  const campaigns = localImport.campaignCount === 1 ? '1 campaign' : `${localImport.campaignCount} campaigns`;

  return (
    <section aria-labelledby="import-title" className="mb-8 rounded-panel border border-gold-600/70 bg-obsidian p-5">
      <div className="flex gap-4">
        <HardDriveUpload className="mt-1 size-6 shrink-0 text-gold-400" aria-hidden />
        <div className="min-w-0">
          <h2 id="import-title" className="font-display text-lg font-semibold text-gold-200">
            {localImport.characterName} is waiting in this browser
          </h2>
          <p className="mt-1 text-sm text-ash">
            You created this character before accounts existed ({campaigns}). Bring them into your account to keep playing on any device. Start dates of campaigns will be reset; nothing else is lost.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await importLocal();
                setBusy(false);
                if (result.ok) navigate('/', { replace: true });
                else setError(result.error);
              }}
            >
              {busy ? 'Bringing them over…' : `Import ${localImport.characterName}`}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmDiscard(true)}>
              Start fresh instead
            </Button>
          </div>
          {error && (
            <Notice tone="warning" className="mt-4">
              {error}
            </Notice>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDiscard}
        title={`Remove ${localImport.characterName} from this browser?`}
        confirmLabel="Remove and start fresh"
        tone="danger"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          discardLocal();
        }}
      >
        <p>The character saved in this browser will be deleted. This cannot be undone.</p>
      </ConfirmDialog>
    </section>
  );
}
