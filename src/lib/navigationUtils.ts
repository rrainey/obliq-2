// lib/navigationUtils.ts - Create new file for navigation utilities

import { Sheet } from '@/lib/modelStore'
import { Breadcrumb, SheetPath } from '@/lib/types'

export function getSheetPath(sheets: Sheet[], targetSheetId: string): Breadcrumb[] {
  const breadcrumbs: Breadcrumb[] = []
  
  // Helper to build path recursively
  function buildPath(
    currentSheets: Sheet[], 
    currentPath: string[], 
    parentId: string | null = null
  ): boolean {
    for (const sheet of currentSheets) {
      const newPath = [...currentPath, sheet.name]
      
      // Found the target sheet
      if (sheet.id === targetSheetId) {
        // Add all sheets in the path as breadcrumbs
        let pathSoFar: string[] = []
        for (let i = 0; i < newPath.length; i++) {
          pathSoFar = newPath.slice(0, i + 1)
          breadcrumbs.push({
            sheetId: i === newPath.length - 1 ? sheet.id : findSheetIdByPath(sheets, pathSoFar),
            sheetName: newPath[i],
            path: pathSoFar
          })
        }
        return true
      }
      
      // Search in subsystems
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem' && block.parameters?.sheets) {
          if (buildPath(block.parameters.sheets, newPath, sheet.id)) {
            return true
          }
        }
      }
    }
    return false
  }
  
  // Helper to find sheet ID by path
  function findSheetIdByPath(searchSheets: Sheet[], path: string[]): string {
    let current = searchSheets
    let sheetId = ''
    
    for (let i = 0; i < path.length; i++) {
      const sheet = current.find(s => s.name === path[i])
      if (sheet) {
        sheetId = sheet.id
        if (i < path.length - 1) {
          // Look for subsystem containing next level
          for (const block of sheet.blocks) {
            if (block.type === 'subsystem' && block.parameters?.sheets) {
              current = block.parameters.sheets
              break
            }
          }
        }
      }
    }
    
    return sheetId
  }
  
  buildPath(sheets, [])
  return breadcrumbs
}