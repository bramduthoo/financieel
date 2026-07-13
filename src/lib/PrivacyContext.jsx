import { createContext, useContext } from 'react'
export const PrivacyContext = createContext({ privacy: false, setPrivacy: () => {} })
export const usePrivacy = () => useContext(PrivacyContext)
