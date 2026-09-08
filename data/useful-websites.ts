export interface UsefulWebsite {
  name: string
  url: string
  category: string
  description: string
}

export const usefulWebsites: UsefulWebsite[] = [
  {
    name: 'Globalping',
    url: 'https://globalping.io/',
    category: 'Mạng & DNS',
    description: 'Kiểm tra DNS, HTTP, ping, traceroute và MTR của domain/IP từ nhiều quốc gia, thành phố hoặc ISP.',
  },
]
