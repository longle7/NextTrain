import { describe, expect, it } from 'vitest'
import { lastMapView, rememberMapView } from './mapSession'

describe('map session memory', () => {
  it('remembers the last subway view and the last bus view separately', () => {
    expect([lastMapView(), lastMapView('subway'), lastMapView('bus')]).toEqual(['', '', '?line=bus'])

    rememberMapView('?line=Red&branch=Mattapan')
    rememberMapView('?line=bus&route=66')
    expect([lastMapView(), lastMapView('subway'), lastMapView('bus')]).toEqual(['?line=bus&route=66', '?line=Red&branch=Mattapan', '?line=bus&route=66'])

    rememberMapView('') // back to every subway line
    expect([lastMapView(), lastMapView('subway'), lastMapView('bus')]).toEqual(['', '', '?line=bus&route=66'])
  })
})
