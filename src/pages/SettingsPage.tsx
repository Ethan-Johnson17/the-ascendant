import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FlaskConical, LogOut, Trash2 } from 'lucide-react';
import { useGame } from '../app/GameProvider.tsx';
import { useAuth } from '../app/AuthProvider.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { Panel } from '../components/ui/Panel.tsx';
import { Button } from '../components/ui/Button.tsx';
import { OptionCard, OptionGroup } from '../components/ui/OptionCard.tsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { SystemStatus } from '../features/settings/SystemStatus.tsx';
import type { MotionPreference } from '../services/save/saveFile.ts';

const motionOptions: Array<{ value: MotionPreference; title: string; text: string }> = [
  { value: 'system', title: 'Match my device', text: 'Follow your device’s reduce-motion setting.' },
  { value: 'reduced', title: 'Reduced', text: 'Keep the screen still: no slides or fades.' },
  { value: 'full', title: 'Full', text: 'Always show animations, including cinematics.' },
];

export default function SettingsPage() {
  const { player, settings, updateSettings, isSample, enterSample, exitSample, deleteProgress, exportData } = useGame();
  const { status, signOut } = useAuth();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null);
  const signedIn = status.state === 'signed-in';

  const download = () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const d = new Date();
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    a.download = `the-ascendant-${isSample ? 'sample' : 'my-data'}-${local}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: 'info', text: 'Your data was downloaded.' });
  };

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Settings" />
      <div aria-live="polite">{message && <Notice tone={message.tone} className="mb-6">{message.text}</Notice>}</div>

      <div className="space-y-6">
        <Panel eyebrow="Account" title={signedIn ? 'Signed in' : 'Not signed in'}>
          {signedIn ? (
            <>
              <p className="text-sm text-ash">
                Signed in as <strong className="font-medium text-ink">{status.user.email}</strong>. Your character and campaigns are saved to this account.
              </p>
              <div className="mt-5">
                <Button
                  variant="secondary"
                  icon={<LogOut className="size-4" aria-hidden />}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const result = await signOut();
                    setBusy(false);
                    if (result.ok) navigate('/welcome', { replace: true });
                    else setMessage({ tone: 'warning', text: result.error });
                  }}
                >
                  Sign out
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-ash">You are previewing the sample adventurer without an account.</p>
          )}
        </Panel>

        <Panel eyebrow="Display" title="Motion">
          <p className="mb-4 text-sm text-ash">Saved on this device only, so each of your devices can have its own setting.</p>
          <OptionGroup label="Motion" className="md:grid-cols-3">
            {motionOptions.map((o) => (
              <OptionCard key={o.value} name="motion" value={o.value} checked={settings.motion === o.value} onSelect={() => updateSettings({ motion: o.value })} title={o.title}>
                {o.text}
              </OptionCard>
            ))}
          </OptionGroup>
        </Panel>

        <Panel eyebrow="Your data" title="Download or delete">
          <p className="text-sm text-ash">
            Download a copy of everything stored about your character, campaigns, gear and achievements. Deleting removes your character and all progress from your account; your sign-in stays, so you can start again.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" icon={<Download className="size-4" aria-hidden />} onClick={download} disabled={!player.character}>
              Download my data
            </Button>
            <Button variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirmDelete(true)} disabled={isSample || !player.character || busy}>
              Delete character and progress
            </Button>
          </div>
          {isSample && <p className="mt-3 text-xs text-smoke">Exit the sample to manage your own data.</p>}
          <p className="mt-3 text-xs text-smoke">Deleting the sign-in account itself will be added before the public beta.</p>
        </Panel>

        <Panel eyebrow="Design preview" title="Sample adventurer">
          <p className="text-sm text-ash">
            Shows a pretend character partway through a campaign so you can judge the design with progress on screen. Clearly marked as sample data, kept in memory only, and never sent to your account.
          </p>
          <div className="mt-5">
            {isSample ? (
              <Button variant="secondary" onClick={() => { exitSample(); navigate(signedIn ? '/' : '/welcome'); }}>
                Exit sample
              </Button>
            ) : (
              <Button variant="secondary" icon={<FlaskConical className="size-4 text-arcane" aria-hidden />} onClick={() => { enterSample(); navigate('/'); }}>
                Preview sample adventurer
              </Button>
            )}
          </div>
        </Panel>

        <Panel eyebrow="For developers" title="System status">
          <SystemStatus />
        </Panel>

        <p className="text-center text-xs text-smoke">The Ascendant · version {__APP_VERSION__} · Phase 2</p>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete your character?"
        confirmLabel="Delete permanently"
        tone="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          setBusy(true);
          const result = await deleteProgress();
          setBusy(false);
          if (result.ok) navigate('/create', { replace: true });
          else setMessage({ tone: 'warning', text: result.error });
        }}
      >
        <p>
          This removes <strong className="text-ink">{player.character?.name ?? 'your character'}</strong>, every campaign, all gear and achievements from your account. It cannot be undone. Download your data first if you might want it.
        </p>
      </ConfirmDialog>
    </div>
  );
}
