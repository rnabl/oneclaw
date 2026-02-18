/**
 * Plumbing Industry Taxonomy
 */

import { IndustryTaxonomy } from '../types';

export const plumbingTaxonomy: IndustryTaxonomy = {
  id: 'plumbing',
  name: 'Plumbing',
  displayName: 'Plumbing',

  services: [
    {
      id: 'drain_cleaning',
      name: 'Drain Cleaning',
      avgJobValue: 250,
      keywords: [
        'drain cleaning',
        'clogged drain',
        'blocked drain',
        'drain unclogging',
        'slow drain',
        'drain snake',
        'hydro jetting',
      ],
    },
    {
      id: 'leak_repair',
      name: 'Leak Repair',
      avgJobValue: 350,
      keywords: [
        'leak repair',
        'pipe leak',
        'water leak',
        'leaky faucet',
        'leak detection',
        'slab leak',
        'pipe repair',
      ],
    },
    {
      id: 'water_heater',
      name: 'Water Heater',
      avgJobValue: 1500,
      keywords: [
        'water heater installation',
        'water heater repair',
        'tankless water heater',
        'hot water heater',
        'water heater replacement',
        'no hot water',
      ],
    },
    {
      id: 'sewer_line',
      name: 'Sewer Line',
      avgJobValue: 4000,
      keywords: [
        'sewer line repair',
        'sewer cleaning',
        'sewer backup',
        'sewer replacement',
        'main line',
        'sewer camera',
        'trenchless repair',
      ],
    },
    {
      id: 'toilet_repair',
      name: 'Toilet Repair',
      avgJobValue: 200,
      keywords: [
        'toilet repair',
        'toilet installation',
        'clogged toilet',
        'running toilet',
        'toilet replacement',
        'toilet leak',
      ],
    },
    {
      id: 'faucet_fixture',
      name: 'Faucet & Fixtures',
      avgJobValue: 300,
      keywords: [
        'faucet installation',
        'faucet repair',
        'bathroom fixtures',
        'kitchen faucet',
        'shower head',
        'fixture replacement',
      ],
    },
    {
      id: 'pipe_replacement',
      name: 'Pipe Replacement',
      avgJobValue: 3500,
      keywords: [
        'pipe replacement',
        'repiping',
        'copper piping',
        'pex piping',
        'burst pipe',
        'pipe upgrade',
      ],
    },
    {
      id: 'garbage_disposal',
      name: 'Garbage Disposal',
      avgJobValue: 350,
      keywords: [
        'garbage disposal',
        'disposal installation',
        'disposal repair',
        'garbage disposal replacement',
        'insinkerator',
      ],
    },
    {
      id: 'emergency_plumbing',
      name: 'Emergency Plumbing',
      avgJobValue: 450,
      keywords: [
        'emergency plumber',
        '24 hour plumber',
        'emergency plumbing',
        'urgent plumbing',
        'plumbing emergency',
      ],
    },
    {
      id: 'commercial_plumbing',
      name: 'Commercial Plumbing',
      avgJobValue: 5000,
      keywords: [
        'commercial plumbing',
        'commercial plumber',
        'restaurant plumbing',
        'industrial plumbing',
        'commercial drain',
      ],
    },
  ],

  aiQuestions: [
    'Who is the best plumber in {city}, {state}?',
    'What plumber should I call for a leak in {city}?',
    'Who should I hire for water heater installation in {city}, {state}?',
    'Best plumbing company near {city}',
  ],

  serviceScanKeywords: [
    'plumbing',
    'plumber',
    'drain',
    'pipe',
    'leak',
    'water heater',
    'sewer',
    'faucet',
    'toilet',
    'fixture',
    'garbage disposal',
    'repiping',
    'hydro jetting',
    'water line',
  ],

  trustSignalKeywords: {
    'licensed': 'Licensed & Insured',
    'insured': 'Fully Insured',
    'bonded': 'Bonded',
    'bbb': 'BBB Accredited',
    'better business': 'BBB Accredited',
    'family owned': 'Family Owned',
    'locally owned': 'Locally Owned',
    'same day': 'Same Day Service',
    '24 hour': '24/7 Emergency Service',
    '24/7': '24/7 Emergency Service',
    'warranty': 'Service Warranty',
    'guarantee': 'Satisfaction Guaranteed',
    'free estimate': 'Free Estimates',
    'master plumber': 'Master Plumber',
  },

  defaultAvgJobValue: 800,
  conversionRate: 0.04,
};
