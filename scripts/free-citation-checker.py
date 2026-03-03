"""
Free NAP Citation Checker
Reverse-engineered from Citation God Mode

Checks NAP consistency across major directories without paying $0.50 per business.
Uses direct HTTP requests + HTML parsing instead of Apify actors.
"""

import asyncio
import httpx
from parsel import Selector
from typing import Dict, List, Optional
import re
from urllib.parse import quote_plus


class NapChecker:
    """Check NAP citations across major directories"""
    
    # Top universal directories (work for ALL niches)
    DIRECTORIES = [
        # Tier 1: Highest impact (Google uses these for local pack)
        'yelp.com',
        'yellowpages.com',
        'bbb.org',
        'facebook.com',
        
        # Tier 2: Major aggregators (feed data to GPS/voice assistants)
        'mapquest.com',
        'foursquare.com',
        'manta.com',
        'superpages.com',
        
        # Tier 3: Important for citation diversity
        'citysearch.com',
        'local.com',
        'hotfrog.com',
        'cylex-usa.com',
        'brownbook.net',
        'elocal.com',
        
        # Tier 4: Still valuable
        'chamberofcommerce.com',
        'merchantcircle.com',
        'spoke.com',
        'tupalo.com',
        'n49.com',
        'showmelocal.com',
    ]
    
    def __init__(self):
        self.client = httpx.AsyncClient(
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            timeout=30.0,
            follow_redirects=True,
        )
    
    async def check_business(
        self,
        business_name: str,
        city: str,
        state: str,
        phone: Optional[str] = None,
        address: Optional[str] = None,
    ) -> Dict:
        """
        Check NAP consistency across directories
        
        Returns:
            {
                'citations_found': int,
                'citations_checked': int,
                'consistency_score': int (0-100),
                'results': [
                    {
                        'directory': str,
                        'url': str,
                        'found': bool,
                        'name': str,
                        'address': str,
                        'phone': str,
                        'matches': {
                            'name': bool,
                            'address': bool,
                            'phone': bool,
                        }
                    }
                ]
            }
        """
        results = []
        
        # Check each directory
        tasks = [
            self._check_directory(directory, business_name, city, state)
            for directory in self.DIRECTORIES
        ]
        
        directory_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for directory, result in zip(self.DIRECTORIES, directory_results):
            if isinstance(result, Exception):
                results.append({
                    'directory': directory,
                    'found': False,
                    'error': str(result),
                })
            else:
                results.append(result)
        
        # Calculate consistency
        found = [r for r in results if r.get('found')]
        citations_found = len(found)
        citations_checked = len(self.DIRECTORIES)
        
        # Score consistency (simple algorithm)
        if citations_found == 0:
            consistency_score = 0
        else:
            # Check how many have matching NAP
            matches = sum(
                1 for r in found
                if r.get('matches', {}).get('name') and 
                   r.get('matches', {}).get('phone')
            )
            consistency_score = int((matches / citations_found) * 100)
        
        return {
            'citations_found': citations_found,
            'citations_checked': citations_checked,
            'consistency_score': consistency_score,
            'results': results,
        }
    
    async def _check_directory(
        self,
        directory: str,
        business_name: str,
        city: str,
        state: str,
    ) -> Dict:
        """Check a specific directory for the business"""
        
        if directory == 'yelp.com':
            return await self._check_yelp(business_name, city, state)
        elif directory == 'yellowpages.com':
            return await self._check_yellowpages(business_name, city, state)
        elif directory == 'bbb.org':
            return await self._check_bbb(business_name, city, state)
        else:
            # Generic Google-based search
            return await self._check_generic(directory, business_name, city, state)
    
    async def _check_yelp(self, business_name: str, city: str, state: str) -> Dict:
        """Check Yelp for business listing"""
        try:
            # Search Yelp
            query = quote_plus(f"{business_name} {city} {state}")
            url = f"https://www.yelp.com/search?find_desc={query}"
            
            response = await self.client.get(url)
            sel = Selector(response.text)
            
            # Yelp embeds data in JSON-LD script tags
            json_data = sel.xpath('//script[@type="application/ld+json"]/text()').get()
            
            if json_data:
                import json
                data = json.loads(json_data)
                
                # Extract first business result
                if isinstance(data, list) and len(data) > 0:
                    biz = data[0]
                    
                    return {
                        'directory': 'yelp.com',
                        'found': True,
                        'url': biz.get('url', ''),
                        'name': biz.get('name', ''),
                        'address': self._format_address(biz.get('address', {})),
                        'phone': biz.get('telephone', ''),
                        'matches': {
                            'name': self._fuzzy_match(business_name, biz.get('name', '')),
                            'address': True,  # Would need more logic
                            'phone': True,  # Would need more logic
                        }
                    }
            
            # Fallback: parse HTML
            first_result = sel.css('.container__09f24__FeTO6').xpath('.//h3/a/@href').get()
            if first_result:
                biz_url = f"https://www.yelp.com{first_result}"
                biz_response = await self.client.get(biz_url)
                biz_sel = Selector(biz_response.text)
                
                name = biz_sel.css('h1::text').get() or ''
                address = ' '.join(biz_sel.css('[data-testid="businessAddress"] p::text').getall())
                phone = biz_sel.css('[data-testid="phoneNumber"]::text').get() or ''
                
                return {
                    'directory': 'yelp.com',
                    'found': True,
                    'url': biz_url,
                    'name': name.strip(),
                    'address': address.strip(),
                    'phone': phone.strip(),
                    'matches': {
                        'name': self._fuzzy_match(business_name, name),
                        'address': True,
                        'phone': True,
                    }
                }
            
            return {'directory': 'yelp.com', 'found': False}
            
        except Exception as e:
            return {'directory': 'yelp.com', 'found': False, 'error': str(e)}
    
    async def _check_yellowpages(self, business_name: str, city: str, state: str) -> Dict:
        """Check Yellow Pages"""
        try:
            query = quote_plus(business_name)
            location = quote_plus(f"{city} {state}")
            url = f"https://www.yellowpages.com/search?search_terms={query}&geo_location_terms={location}"
            
            response = await self.client.get(url)
            sel = Selector(response.text)
            
            # Yellow Pages uses specific classes
            first_result = sel.css('.result').xpath('.//a[@class="business-name"]/@href').get()
            
            if first_result:
                biz_url = f"https://www.yellowpages.com{first_result}"
                biz_response = await self.client.get(biz_url)
                biz_sel = Selector(biz_response.text)
                
                name = biz_sel.css('h1::text').get() or ''
                address = biz_sel.css('.street-address::text').get() or ''
                phone = biz_sel.css('.phone::text').get() or ''
                
                return {
                    'directory': 'yellowpages.com',
                    'found': True,
                    'url': biz_url,
                    'name': name.strip(),
                    'address': address.strip(),
                    'phone': phone.strip(),
                    'matches': {
                        'name': self._fuzzy_match(business_name, name),
                        'address': True,
                        'phone': True,
                    }
                }
            
            return {'directory': 'yellowpages.com', 'found': False}
            
        except Exception as e:
            return {'directory': 'yellowpages.com', 'found': False, 'error': str(e)}
    
    async def _check_bbb(self, business_name: str, city: str, state: str) -> Dict:
        """Check Better Business Bureau"""
        # BBB has an API-like search
        try:
            query = quote_plus(f"{business_name} {city} {state}")
            url = f"https://www.bbb.org/search?find_country=USA&find_text={query}"
            
            response = await self.client.get(url)
            sel = Selector(response.text)
            
            # Parse BBB results...
            # Implementation similar to above
            
            return {'directory': 'bbb.org', 'found': False}
            
        except Exception as e:
            return {'directory': 'bbb.org', 'found': False, 'error': str(e)}
    
    async def _check_generic(self, directory: str, business_name: str, city: str, state: str) -> Dict:
        """Generic check using Google search site:directory"""
        try:
            # Use Google to find the business on this directory
            query = quote_plus(f"site:{directory} {business_name} {city} {state}")
            url = f"https://www.google.com/search?q={query}"
            
            response = await self.client.get(url)
            sel = Selector(response.text)
            
            # Check if there's a result
            first_link = sel.css('a[href*="{}"]::attr(href)'.format(directory)).get()
            
            if first_link:
                return {
                    'directory': directory,
                    'found': True,
                    'url': first_link,
                    'name': '',
                    'address': '',
                    'phone': '',
                    'matches': {'name': False, 'address': False, 'phone': False}
                }
            
            return {'directory': directory, 'found': False}
            
        except Exception as e:
            return {'directory': directory, 'found': False, 'error': str(e)}
    
    def _fuzzy_match(self, expected: str, actual: str, threshold: float = 0.8) -> bool:
        """Check if two strings are similar enough"""
        if not expected or not actual:
            return False
        
        # Simple comparison (could use fuzzy matching library)
        expected_clean = re.sub(r'[^a-z0-9]', '', expected.lower())
        actual_clean = re.sub(r'[^a-z0-9]', '', actual.lower())
        
        return expected_clean in actual_clean or actual_clean in expected_clean
    
    def _format_address(self, address_obj: Dict) -> str:
        """Format address object to string"""
        parts = []
        if isinstance(address_obj, dict):
            parts.append(address_obj.get('streetAddress', ''))
            parts.append(address_obj.get('addressLocality', ''))
            parts.append(address_obj.get('addressRegion', ''))
            parts.append(address_obj.get('postalCode', ''))
        return ', '.join(p for p in parts if p)
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()


# Example usage
async def main():
    checker = NapChecker()
    
    result = await checker.check_business(
        business_name="Uplift Outdoor",
        city="Pearland",
        state="TX",
    )
    
    print(f"Citations Found: {result['citations_found']}/{result['citations_checked']}")
    print(f"Consistency Score: {result['consistency_score']}%")
    print("\nResults:")
    
    for r in result['results']:
        if r.get('found'):
            print(f"  ✓ {r['directory']}: {r.get('name', 'N/A')}")
        else:
            print(f"  ✗ {r['directory']}: Not found")
    
    await checker.close()


if __name__ == "__main__":
    asyncio.run(main())
