/**
 * Dental Industry Taxonomy
 */

import { IndustryTaxonomy } from '../types';

export const dentalTaxonomy: IndustryTaxonomy = {
  id: 'dental',
  name: 'Dental',
  displayName: 'Dental Practice',

  services: [
    {
      id: 'general_dentistry',
      name: 'General Dentistry',
      avgJobValue: 250,
      keywords: [
        'dental checkup',
        'teeth cleaning',
        'dental exam',
        'general dentist',
        'family dentist',
        'routine dental',
      ],
    },
    {
      id: 'cosmetic_dentistry',
      name: 'Cosmetic Dentistry',
      avgJobValue: 3000,
      keywords: [
        'teeth whitening',
        'veneers',
        'cosmetic dentistry',
        'smile makeover',
        'dental bonding',
        'tooth reshaping',
      ],
    },
    {
      id: 'dental_implants',
      name: 'Dental Implants',
      avgJobValue: 4500,
      keywords: [
        'dental implants',
        'tooth implant',
        'implant dentist',
        'all on 4',
        'implant surgery',
        'missing teeth',
      ],
    },
    {
      id: 'orthodontics',
      name: 'Orthodontics',
      avgJobValue: 5500,
      keywords: [
        'braces',
        'invisalign',
        'orthodontist',
        'teeth straightening',
        'clear aligners',
        'orthodontic treatment',
      ],
    },
    {
      id: 'root_canal',
      name: 'Root Canal',
      avgJobValue: 1200,
      keywords: [
        'root canal',
        'endodontics',
        'tooth infection',
        'root canal treatment',
        'endodontist',
        'tooth pain',
      ],
    },
    {
      id: 'tooth_extraction',
      name: 'Tooth Extraction',
      avgJobValue: 350,
      keywords: [
        'tooth extraction',
        'wisdom teeth',
        'tooth removal',
        'wisdom tooth extraction',
        'dental surgery',
      ],
    },
    {
      id: 'dentures',
      name: 'Dentures',
      avgJobValue: 2000,
      keywords: [
        'dentures',
        'partial dentures',
        'full dentures',
        'denture repair',
        'denture fitting',
        'false teeth',
      ],
    },
    {
      id: 'crowns_bridges',
      name: 'Crowns & Bridges',
      avgJobValue: 1500,
      keywords: [
        'dental crown',
        'dental bridge',
        'tooth crown',
        'crown replacement',
        'same day crown',
        'cerec crown',
      ],
    },
    {
      id: 'emergency_dental',
      name: 'Emergency Dental',
      avgJobValue: 400,
      keywords: [
        'emergency dentist',
        'dental emergency',
        'tooth pain emergency',
        'broken tooth',
        'urgent dental',
        'same day dental',
      ],
    },
    {
      id: 'pediatric_dentistry',
      name: 'Pediatric Dentistry',
      avgJobValue: 200,
      keywords: [
        'pediatric dentist',
        'kids dentist',
        'children dentist',
        'child dental',
        'baby teeth',
        'family dentistry',
      ],
    },
  ],

  aiQuestions: [
    'Who is the best dentist in {city}, {state}?',
    'What dental clinic should I go to for implants in {city}?',
    'Who should I see for teeth whitening in {city}, {state}?',
    'Best orthodontist near {city}',
  ],

  serviceScanKeywords: [
    'dentist',
    'dental',
    'teeth',
    'tooth',
    'orthodontics',
    'implants',
    'whitening',
    'braces',
    'invisalign',
    'veneers',
    'crown',
    'root canal',
    'extraction',
    'dentures',
    'oral surgery',
  ],

  trustSignalKeywords: {
    'board certified': 'Board Certified',
    'ada member': 'ADA Member',
    'american dental': 'ADA Member',
    'invisalign certified': 'Invisalign Certified',
    'sedation dentistry': 'Sedation Available',
    'family dentist': 'Family Friendly',
    'same day': 'Same Day Appointments',
    'emergency': 'Emergency Services',
    'accepting new patients': 'Accepting New Patients',
    'insurance accepted': 'Insurance Accepted',
    'financing': 'Financing Available',
    'free consultation': 'Free Consultations',
  },

  defaultAvgJobValue: 800,
  conversionRate: 0.05,
};
