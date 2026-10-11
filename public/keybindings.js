// Map undo and redo shortcuts without intercepting normal text editing.
export function drawingShortcut(event){
 if(event.defaultPrevented||event.isComposing||event.altKey||!(event.metaKey||event.ctrlKey)||event.key.toLowerCase()!=='z')return null;
 const target=event.target;
 if(target?.isContentEditable||target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))return null;
 return event.shiftKey?'redo':'undo';
}
