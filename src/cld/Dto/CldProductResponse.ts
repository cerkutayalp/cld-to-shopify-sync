export interface ProductResponse {
  products: Product[]
  count: number
}

export interface Product {
  identifier: string
  name: Name
  price: number
  brand: string
  image: string
  customerRef: string
  supplierRef: string
  statusPreorder: boolean
  vgMenuLanguages: string[]
  stock: number
  salesMultiple: number
  ean: string
  platforms: string[]
  suggestedRetailPrice: number
  presaleDate: string
  isPromo: boolean
  releaseDate: string
  license: string
  pegi: string
  genres: string[]
  categories: Categories
  readOnly: boolean
  widthMillimeter: number
  heightMillimeter: number
  lengthMillimeter: number
  weightGram: number
  created: string
  updated: string
}

export interface Name {
  en_GB: string
  fr_BE: string
  nl_BE: string
  de_DE?: string
  es_ES?: string
  it_IT?: string
  pl_PL?: string
  sv_SE?: string
}

export interface Categories {
  en_GB?: string
  fr_BE?: string
  nl_BE?: string
  de_DE?: string
  es_ES?: string
  it_IT?: string
  pl_PL?: string
  sv_SE: any
}

export interface PaginationPayload {
  pageSize: number;
  pageNumber: number;
}