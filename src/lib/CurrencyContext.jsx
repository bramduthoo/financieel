import { createContext, useContext } from 'react'
export const CurrencyContext = createContext({ currency: 'EUR', setCurrency: () => {} })
export const useCurrency = () => useContext(CurrencyContext)
