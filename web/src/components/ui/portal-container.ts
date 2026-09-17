import * as React from 'react'

/**
 * Element that floating popups (Combobox, Select, ...) portal into instead of
 * `document.body`. Layered surfaces that disable pointer events or trap focus
 * outside themselves, such as the vaul-based Drawer, provide their own content
 * element so nested popups stay interactive. `undefined` keeps the default.
 */
const PortalContainerContext = React.createContext<
  React.RefObject<HTMLElement | null> | undefined
>(undefined)

function usePortalContainer() {
  return React.useContext(PortalContainerContext)
}

export { PortalContainerContext, usePortalContainer }
