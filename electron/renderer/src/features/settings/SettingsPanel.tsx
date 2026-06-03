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
import type { AgentCliDesktopSkillInventory, AgentCliDesktopSkillSummary } from '../../types/desktop-api';
import type { RendererLogEntry, ThemePreference } from '../../types/ui';

export interface SettingsPanelProps {
  globalSkillsEnabled: boolean;
  logs: RendererLogEntry[];
  open: boolean;
  projectSkillsEnabled: boolean;
  showToolMessages: boolean;
  skillInventory: AgentCliDesktopSkillInventory;
  disabledSkillKeys: string[];
  themePreference: ThemePreference;
  onGlobalSkillsEnabledChange: (enabled: boolean) => void;
  onProjectSkillsEnabledChange: (enabled: boolean) => void;
  onSkillEnabledChange: (skill: AgentCliDesktopSkillSummary, enabled: boolean) => void;
  onShowToolMessagesChange: (enabled: boolean) => void;
  onThemePreferenceChange: (preference: ThemePreference) => void;
}

const THEME_CHOICES: Array<{ value: ThemePreference; label: string; icon: 'system' | 'sun' | 'moon' }> = [
  { value: 'system', label: 'System theme', icon: 'system' },
  { value: 'light', label: 'Light theme', icon: 'sun' },
  { value: 'dark', label: 'Dark theme', icon: 'moon' },
];

function skillTitle(skill: AgentCliDesktopSkillSummary): string {
  return [skill.description, skill.sourcePath].filter(Boolean).join('\n') || skill.skillId;
}

function buildSkillSelectionKey(skill: AgentCliDesktopSkillSummary): string {
  return `${skill.sourceScope || 'skill'}:${skill.skillId}:${skill.sourcePath || ''}`;
}

function renderSkillRows(
  skills: AgentCliDesktopSkillSummary[],
  emptyLabel: string,
  params: {
    disabledSkillKeySet: Set<string>;
    scopeEnabled: boolean;
    onSkillEnabledChange: (skill: AgentCliDesktopSkillSummary, enabled: boolean) => void;
  },
) {
  if (!skills.length) {
    return <div className="aw-skill-empty">{emptyLabel}</div>;
  }

  return skills.map((skill) => {
    const skillKey = buildSkillSelectionKey(skill);
    const skillEnabled = !params.disabledSkillKeySet.has(skillKey);

    return (
      <div className="aw-skill-row" title={skillTitle(skill)} key={skillKey}>
        <Button className="aw-skill-edit" variant="ghost" size="icon" aria-label={`Edit skill ${skill.skillId}`} title={skill.sourcePath || skill.skillId} disabled><Icon name="edit" /></Button>
        <span className="aw-skill-name">{skill.skillId}</span>
        <Switch
          checked={params.scopeEnabled && skillEnabled}
          size="sm"
          aria-label={`Enable ${skill.skillId}`}
          disabled={!params.scopeEnabled}
          onClick={() => params.onSkillEnabledChange(skill, !skillEnabled)}
        />
      </div>
    );
  });
}

export default function SettingsPanel({
  globalSkillsEnabled,
  logs,
  open,
  projectSkillsEnabled,
  showToolMessages,
  skillInventory,
  disabledSkillKeys,
  themePreference,
  onGlobalSkillsEnabledChange,
  onProjectSkillsEnabledChange,
  onSkillEnabledChange,
  onShowToolMessagesChange,
  onThemePreferenceChange,
}: SettingsPanelProps) {
  const disabledSkillKeySet = new Set(disabledSkillKeys);

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
            {renderSkillRows(skillInventory.user, 'None', {
              disabledSkillKeySet,
              scopeEnabled: globalSkillsEnabled,
              onSkillEnabledChange,
            })}
          </div>

          <div className="aw-switch-row aw-switch-control">
            <span>Enable Project Skills</span>
            <Switch id="enable-project-skills-toggle" aria-label="Enable Project Skills" checked={projectSkillsEnabled} onClick={() => onProjectSkillsEnabledChange(!projectSkillsEnabled)} />
          </div>
          <div className="aw-skill-list" aria-label="Project skills">
            {renderSkillRows(skillInventory.project, 'None', {
              disabledSkillKeySet,
              scopeEnabled: projectSkillsEnabled,
              onSkillEnabledChange,
            })}
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