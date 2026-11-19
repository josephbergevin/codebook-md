import * as config from '../config';
import { FolderGroup } from '../folders';
import { isIconName, relatedGroupId } from '../sideBarSettings';
import { escapeHtml } from './notebooksViewHtml';

/**
 * HTML for the parts of a My Notebooks group that the settings UI adds: the
 * gear in its header, its icon, and the drawer of options that opens under
 * the header.
 *
 * Controls carry what they change as data attributes; the page script reads
 * those and posts a message. Nothing from a name or a path is written into a
 * handler.
 */

/** groupIconHtml returns a group's codicon, or nothing when it has none. */
export function groupIconHtml(icon: string | undefined): string {
  return isIconName(icon)
    ? `<span class="codicon codicon-${icon} group-icon" aria-hidden="true"></span>`
    : '';
}

/** gearButtonHtml returns the button that opens a group's drawer. */
export function gearButtonHtml(groupName: string): string {
  const label = escapeHtml(`Settings for ${groupName}`);
  return `<button class="action-button gear-button" title="${label}" aria-label="${label}" aria-expanded="false" onclick="event.stopPropagation(); toggleDrawer(this)"><span class="codicon codicon-settings-gear" aria-hidden="true"></span></button>`;
}

function switchHtml(label: string, isOn: boolean, attrs: string, focusKey: string): string {
  return `<label class="drawer-switch"><input type="checkbox" role="switch"${isOn ? ' checked' : ''} ${attrs} data-focus-key="${escapeHtml(focusKey)}" onchange="drawerSwitch(this)"><span>${escapeHtml(label)}</span></label>`;
}

function chipsHtml(label: string, settingKey: string, values: string[], placeholder: string): string {
  const key = escapeHtml(settingKey);
  const chips = values.map(value => {
    const text = escapeHtml(value);
    return `<span class="chip"><span class="chip-text">${text}</span><button class="chip-remove" title="Remove ${text}" aria-label="Remove ${text}" data-value="${text}" data-focus-key="${key}:add" onclick="drawerRemoveChip(this)"><span class="codicon codicon-close" aria-hidden="true"></span></button></span>`;
  }).join('');
  // The whole list travels with the container, so the page can send the new one
  return `<div class="drawer-field">
        <span class="drawer-label">${escapeHtml(label)}</span>
        <div class="chips" data-setting="${key}" data-values="${escapeHtml(JSON.stringify(values))}">
          ${chips}<input class="chip-input" type="text" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(`${label}: ${placeholder}`)}" spellcheck="false" data-focus-key="${key}:add" onkeydown="drawerChipKey(event, this)">
        </div>
      </div>`;
}

function allSettingsHtml(groupId: string): string {
  return `<button class="drawer-link" data-group-id="${escapeHtml(groupId)}" onclick="openAllSettings(this)">All settings</button>`;
}

/**
 * relatedDrawerHtml returns the drawer for the generated group: the switches
 * changed most often. Everything else is in the settings panel.
 */
export function relatedDrawerHtml(settings: config.DynamicFolderGroupConfig): string {
  const setting = (key: string) => `data-setting="${escapeHtml(key)}"`;
  return `<div class="group-drawer" data-drawer hidden>
      ${switchHtml('Find agent docs', settings.includeAgentDocs, setting('dynamicFolderGroup.includeAgentDocs'), 'dynamicFolderGroup.includeAgentDocs')}
      ${switchHtml('Scoped rules at their folder', settings.placeRulesByScope, setting('dynamicFolderGroup.placeRulesByScope'), 'dynamicFolderGroup.placeRulesByScope')}
      ${switchHtml('Start collapsed', settings.startCollapsed, setting('dynamicFolderGroup.startCollapsed'), 'dynamicFolderGroup.startCollapsed')}
      ${chipsHtml('Look inside', 'dynamicFolderGroup.subFolderInclusions', settings.subFolderInclusions ?? [], 'Add a folder')}
      <div class="drawer-links">${allSettingsHtml(relatedGroupId)}</div>
    </div>`;
}

/**
 * folderGroupDrawerHtml returns the drawer for a group built by hand.
 * @param index the group's position in codebook-md.json's folderGroups
 */
export function folderGroupDrawerHtml(group: FolderGroup, index: number): string {
  const groupAttr = `data-group-index="${index}"`;
  const focusKey = (field: string) => `group:${index}:${field}`;
  const textField = (label: string, field: string, value: string) => `<label class="drawer-field">
        <span class="drawer-label">${escapeHtml(label)}</span>
        <input class="drawer-input" type="text" value="${escapeHtml(value)}" ${groupAttr} data-field="${field}" data-focus-key="${escapeHtml(focusKey(field))}" spellcheck="false" onchange="drawerGroupText(this)">
      </label>`;
  return `<div class="group-drawer" data-drawer hidden>
      ${textField('Name', 'name', group.name ?? '')}
      ${textField('Description', 'description', group.description ?? '')}
      ${switchHtml('Start collapsed', group.collapsed === true, `${groupAttr} data-field="collapsed"`, focusKey('collapsed'))}
      <div class="drawer-links">
        <button class="drawer-link" ${groupAttr} title="Hide this group. Side Bar Settings brings it back." onclick="drawerHideGroup(this)">Hide group</button>
        ${allSettingsHtml(`group:${index}`)}
      </div>
    </div>`;
}
