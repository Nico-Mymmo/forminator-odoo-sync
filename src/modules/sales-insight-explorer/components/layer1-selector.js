/**
 * Laag 1: Information Object Selector Component
 * 
 * Radio button lijst van semantic layers
 * Implementeert ITERATION_8_IMPLEMENTATION.md Section 2.1
 * 
 * @module components/layer1-selector
 */

import { getAllSemanticLayers } from '../config/semantic-layers.js';

/**
 * Render Layer 1 selector
 */
export function renderLayer1Selector(selectedLayerId, onSelect) {
  const layers = getAllSemanticLayers();

  return `
    <div class="layer1-selector">
      <h3 class="text-lg font-semibold mb-4">Wat wil je weten over je salesacties?</h3>
      
      <div class="space-y-2">
        ${layers.map(layer => `
          <label class="flex items-start p-3 border rounded cursor-pointer hover:bg-base-200 transition-colors ${selectedLayerId === layer.id ? 'border-primary bg-primary/10' : 'border-base-300'}">
            <input 
              type="radio" 
              name="semantic-layer" 
              value="${layer.id}"
              class="radio radio-primary mt-1"
              ${selectedLayerId === layer.id ? 'checked' : ''}
              onchange="window.semanticBuilder.selectLayer('${layer.id}')"
            />
            <div class="ml-3 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-2xl">${getLayerIcon(layer.icon)}</span>
                <span class="font-medium">${layer.label}</span>
              </div>
              <p class="text-sm text-base-content/70 mt-1">${layer.description}</p>
              
              ${layer.sub_options && layer.sub_options.length > 0 && selectedLayerId === layer.id ? `
                <div class="mt-3 ml-6 space-y-1">
                  ${layer.sub_options.map(subOpt => `
                    <label class="flex items-center text-sm cursor-pointer">
                      <input 
                        type="radio" 
                        name="sub-option" 
                        value="${subOpt.id}"
                        class="radio radio-sm radio-primary"
                        onchange="window.semanticBuilder.selectSubOption('${subOpt.id}')"
                      />
                      <span class="ml-2">${subOpt.label}</span>
                      <span class="ml-2 text-xs text-base-content/60">${subOpt.description}</span>
                    </label>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </label>
        `).join('')}
      </div>

      <div class="mt-4 text-sm text-base-content/60">
        <strong>Let op:</strong> Alle analyses starten bij actiebladen. Dit is geen generieke BI-tool.
      </div>
    </div>
  `;
}

/**
 * Get emoji icon for layer
 */
function getLayerIcon(iconName) {
  const icons = {
    'alert-triangle': '⚠️',
    'calendar': '📅',
    'layers': '📊',
    'building': '🏢',
    'target': '🎯',
    'list': '📋'
  };
  return icons[iconName] || '📌';
}
