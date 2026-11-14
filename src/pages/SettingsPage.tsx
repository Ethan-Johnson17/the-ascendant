import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FlaskConical, Trash2 } from 'lucide-react';
import { useGame } from '../app/GameProvider.tsx';
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
  const { save, settings, updateSettings, isSample, enterSample, exitSample, deleteAllData, exportSave } = useGame();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const download = () => {
    const blob = new Blob([exportSave()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const d = new Date();
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    a.download = `the-ascendant-save-${local}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDone('Your save was downloaded.');
  };

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Settings" />
      <div aria-live="polite">{done && <Notice className="mb-6">{done}</Notice>}</div>

      <div className="space-y-6">
        <Panel eyebrow="Display" title="Motion">
          <OptionGroup label="Motion" className="md:grid-cols-3">
            {motionOptions.map((o) => (
              <OptionCard key={o.value} name="motion" value={o.value} checked={settings.motion === o.value} onSelect={() => updateSettings({ motion: o.value })} title={o.title}>
                {o.text}
              </OptionCard>
            ))}
          </OptionGroup>
        </Panel>

        <Panel eyebrow="Your data" title="Saved on this device">
          <p className="text-sm text-ash">
            Until accounts arrive in Phase 2, your character and campaigns are stored in this browser only. Clearing your browser data or switching devices will lose them, so download a copy if it matters to you.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" icon={<Download className="size-4" aria-hidden />} onClick={download} disabled={!save.character && !isSample}>
              Download my save
            </Button>
            <Button variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirmDelete(true)} disabled={isSample}>
              Delete character and progress
            </Button>
          </div>
          {isSample && <p className="mt-3 text-xs text-smoke">Exit the sample to manage your own save.</p>}
        </Panel>

        <Panel eyebrow="Design preview" title="Sample adventurer">
          <p className="text-sm text-ash">
            Shows a pretend character partway through a campaign so you can judge the design with progress on screen. Clearly marked as sample data, kept in memory only, and never mixed with your own save.
          </p>
          <div className="mt-5">
            {isSample ? (
              <Button variant="secondary" onClick={() => { exitSample(); navigate('/'); }}>
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

        <p className="text-center text-xs text-smoke">The Ascendant · version {__APP_VERSION__} · Phase 1</p>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete your character?"
        confirmLabel="Delete permanently"
        tone="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          deleteAllData();
          navigate('/welcome');
        }}
      >
        <p>
          This removes <strong className="text-ink">{save.character?.name ?? 'your character'}</strong> and every campaign from this device. It cannot be undone. Download your save first if you might want it back.
        </p>
      </ConfirmDialog>
    </div>
  );
}
