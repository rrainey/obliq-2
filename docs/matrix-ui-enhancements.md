# Integration Guide for Matrix UI Enhancements

## Files to Create

### 1. Create `components/MuxConfig.tsx`
Copy the MuxConfig component from the artifact above to this new file.

## Files to Update

### 2. Update `app/models/[id]/page.tsx`

#### Add Import
Add this import near the top with the other component imports:
```typescript
import MuxConfig from '@/components/MuxConfig'
```

#### Update getDefaultParameters function
Find the `getDefaultParameters` function and add the mux case:
```typescript
case 'mux':
  return {
    rows: 2,
    cols: 2,
    outputType: 'double[2][2]',
    baseType: 'double'
  }
```

#### Update handleBlockDoubleClick
Find the `handleBlockDoubleClick` function and add 'mux' to the list of configurable blocks:
```typescript
if (block && (
  block.type === 'input_port' || 
  block.type === 'output_port' || 
  block.type === 'source' ||
  block.type === 'scale' ||
  block.type === 'transfer_function' ||
  block.type === 'subsystem' ||
  block.type === 'lookup_1d' ||
  block.type === 'lookup_2d' ||
  block.type === 'sheet_label_sink' || 
  block.type === 'sheet_label_source' ||
  block.type === 'mux'  // Add this line
)) {
  console.log('Setting config block:', block)
  setConfigBlock(block)
}
```

#### Add MuxConfig to Configuration Modals Section
Find the section with all the configuration modals (near the bottom of the component, after `{configBlock && (`) and add:
```typescript
{configBlock.type === 'mux' && (
  <MuxConfig
    block={configBlock}
    onUpdate={handleBlockConfigUpdate}
    onClose={() => setConfigBlock(null)}
  />
)}
```

### 3. Replace `components/CustomEdge.tsx`

Replace the entire contents of `components/CustomEdge.tsx` with the enhanced version from the artifact above. The key changes include:

- New `extractMatrixDimensions` helper function
- New `formatTypeForDisplay` helper function
- Enhanced edge styling for matrix connections
- Always-visible labels for matrix types
- Purple color scheme for matrix connections
- New matrix arrow marker

### 4. Update `components/BlockNode.tsx` (if needed)

The current BlockNode already shows mux dimensions correctly, but ensure the mux block case in `getBlockSymbol` shows:
```typescript
if (data.type === 'mux') {
  const rows = data.parameters?.rows || 2
  const cols = data.parameters?.cols || 2
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="text-lg font-bold">▦</div>
      <div className="text-xs text-gray-600 mt-0.5">
        {rows}×{cols}
      </div>
    </div>
  )
}
```

## Testing the Enhancements

### Test MuxConfig Dialog
1. Drag a Mux block onto the canvas
2. Double-click the Mux block
3. Verify the configuration dialog appears
4. Try changing rows/cols and see the port preview update
5. Save and verify the block updates with the correct number of ports

### Test Matrix Wire Visualization
1. Create a Source block with matrix type (e.g., `double[3][4]`)
2. Connect it to another block
3. Verify the wire shows the matrix dimensions as `double[3×4]`
4. Verify matrix wires are visually distinct (thicker, purple labels)
5. Test hovering over scalar wires vs matrix wires

### Test Edge Cases
1. Create a large mux (e.g., 10×10) and verify the warning appears
2. Connect incompatible matrix dimensions and verify error display
3. Test that existing non-matrix connections still work normally

## Visual Design Decisions

### Matrix Wire Styling
- **Thickness**: 3px (vs 2px for scalar)
- **Dash pattern**: "10,3" when not hovered/selected
- **Color**: Purple (#7c3aed) for labels and arrows
- **Labels**: Always visible for matrix types, with purple background

### MuxConfig Dialog
- **Max dimensions**: 100×100 (practical limit)
- **Warning threshold**: 20 ports
- **Port numbering**: 0-indexed, row-major order
- **Visual grid**: Shows exact port layout

## Performance Considerations

1. The enhanced CustomEdge component adds minimal overhead as it only calculates dimensions when needed
2. Matrix dimension labels are lightweight and don't impact performance
3. The MuxConfig dialog only renders when opened

## Future Enhancements

Consider adding:
1. Keyboard shortcuts for quick dimension changes in MuxConfig
2. Copy/paste matrix dimensions between mux blocks
3. Preset dimension buttons (2×2, 3×3, 4×4, etc.)
4. Matrix dimension validation based on connected signals