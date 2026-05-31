/**
 * Settings Panel Feature
 *
 * Purpose:
 * - Render local renderer settings.
 *
 * Recent changes:
 * - 2026-05-31: Replaced settings checkbox rendering with the Agent World-style switch primitive.
 * - 2026-05-31: Added React settings panel with theme, tools, skills, and logs sections.
 */
import { Button, Icon, Switch } from '../../design-system';
import PanelSection from './PanelSection';
import StatusLog from './StatusLog';
import type { RendererLogEntry, ThemePreference } from '../../types/ui';

export interface SettingsPanelProps {
  globalSkillsEnabled: boolean;
  logs: RendererLogEntry[];
  open: boolean;
  projectSkillsEnabled: boolean;
  showToolMessages: boolean;
  themePreference: ThemePreference;
  onGlobalSkillsEnabledChange: (enabled: boolean) => void;
  onProjectSkillsEnabledChange: (enabled: boolean) => void;
  onShowToolMessagesChange: (enabled: boolean) => void;
  onThemePreferenceChange: (preference: ThemePreference) => void;
}

const THEME_CHOICES: Array<{ value: ThemePreference; label: string; icon: 'system' | 'sun' | 'moon' }> = [
  { value: 'system', label: 'System theme', icon: 'system' },
  { value: 'light', label: 'Light theme', icon: 'sun' },
  { value: 'dark', label: 'Dark theme', icon: 'moon' },
];

export default function SettingsPanel({
  globalSkillsEnabled,
  logs,
  open,
  projectSkillsEnabled,
  showToolMessages,
  themePreference,
  onGlobalSkillsEnabledChange,
  onProjectSkillsEnabledChange,
  onShowToolMessagesChange,
  onThemePreferenceChange,
}: SettingsPanelProps) {
  return (
    <aside id="right-panel" className="aw-right-panel" aria-label="Settings" aria-hidden={!open} inert={!open}>
      <PanelSection title="Theme" className="aw-theme-section">
        <div className="aw-segmented" role="group" aria-label="Theme preference">
          {THEME_CHOICES.map((choice) => (
            <button
              className={`aw-theme-button${themePreference === choice.value ? ' is-active' : ''}`}
              type="button"
              data-theme-choice={choice.value}
              aria-label={choice.label}
              aria-pressed={themePreference === choice.value}
              title={choice.label}
              key={choice.value}
              onClick={() => onThemePreferenceChange(choice.value)}
            >
              <Icon name={choice.icon} />
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Show tool messages" className="aw-tools-section">
        <div className="aw-switch-row aw-switch-control">
          <Switch id="show-tool-messages-toggle" aria-label="Show tool messages" checked={showToolMessages} onClick={() => onShowToolMessagesChange(!showToolMessages)} />
        </div>
      </PanelSection>

      <PanelSection title="Skills" className="aw-skills-panel">
        <div className="aw-switch-list">
          <div className="aw-switch-row aw-switch-control">
            <span>Enable Global Skills</span>
            <Switch id="enable-global-skills-toggle" aria-label="Enable Global Skills" checked={globalSkillsEnabled} onClick={() => onGlobalSkillsEnabledChange(!globalSkillsEnabled)} />
          </div>
          <div className="aw-skill-list" aria-label="Global skills">
            <div className="aw-skill-row">
              <Button className="aw-skill-edit" variant="ghost" size="icon" aria-label="Edit skill load-skill" title="UI only" disabled><Icon name="edit" /></Button>
              <span className="aw-skill-name">load-skill</span>
              <Switch checked size="sm" aria-label="Enable load-skill" disabled />
            </div>
          </div>

          <div className="aw-switch-row aw-switch-control">
            <span>Enable Project Skills</span>
            <Switch id="enable-project-skills-toggle" aria-label="Enable Project Skills" checked={projectSkillsEnabled} onClick={() => onProjectSkillsEnabledChange(!projectSkillsEnabled)} />
          </div>
          <div className="aw-skill-list" aria-label="Project skills">
            <div className="aw-skill-row">
              <Button className="aw-skill-edit" variant="ghost" size="icon" aria-label="Edit skill workspace-context" title="UI only" disabled><Icon name="edit" /></Button>
              <span className="aw-skill-name">workspace-context</span>
              <Switch checked size="sm" aria-label="Enable workspace-context" disabled />
            </div>
            <Button className="aw-panel-link" variant="ghost" disabled>Install Skill ...</Button>
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Logs" className="aw-log-panel">
        <StatusLog logs={logs} />
      </PanelSection>
    </aside>
  );
}