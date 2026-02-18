/**
 * HVAC Industry Taxonomy
 */

import { IndustryTaxonomy } from '../types';

export const hvacTaxonomy: IndustryTaxonomy = {
  id: 'hvac',
  name: 'HVAC',
  displayName: 'HVAC',

  services: [
    {
      id: 'ac_repair',
      name: 'AC Repair',
      avgJobValue: 350,
      keywords: [
        'ac repair',
        'air conditioning repair',
        'ac not cooling',
        'air conditioner not working',
        'ac service',
        'ac technician',
        'ac fix',
      ],
    },
    {
      id: 'ac_installation',
      name: 'AC Installation',
      avgJobValue: 5500,
      keywords: [
        'ac installation',
        'new ac unit',
        'air conditioning installation',
        'ac replacement',
        'central air installation',
        'ac upgrade',
      ],
    },
    {
      id: 'furnace_repair',
      name: 'Furnace Repair',
      avgJobValue: 400,
      keywords: [
        'furnace repair',
        'heater repair',
        'furnace not working',
        'heater not working',
        'no heat',
        'furnace technician',
      ],
    },
    {
      id: 'furnace_installation',
      name: 'Furnace Installation',
      avgJobValue: 4500,
      keywords: [
        'furnace installation',
        'new furnace',
        'furnace replacement',
        'heating system installation',
        'furnace upgrade',
      ],
    },
    {
      id: 'heat_pump',
      name: 'Heat Pump',
      avgJobValue: 6000,
      keywords: [
        'heat pump installation',
        'heat pump repair',
        'heat pump service',
        'heat pump cost',
        'mini split installation',
        'ductless ac',
      ],
    },
    {
      id: 'hvac_maintenance',
      name: 'HVAC Maintenance',
      avgJobValue: 150,
      keywords: [
        'hvac tune up',
        'ac tune up',
        'furnace tune up',
        'hvac maintenance',
        'heating maintenance',
        'cooling maintenance',
        'hvac inspection',
      ],
    },
    {
      id: 'emergency_hvac',
      name: 'Emergency HVAC',
      avgJobValue: 500,
      keywords: [
        'emergency hvac',
        'emergency ac repair',
        'emergency heating repair',
        '24 hour hvac',
        'hvac emergency service',
        'after hours hvac',
      ],
    },
    {
      id: 'duct_work',
      name: 'Duct Work',
      avgJobValue: 2500,
      keywords: [
        'duct cleaning',
        'duct repair',
        'duct installation',
        'ductwork',
        'air duct cleaning',
        'hvac duct',
      ],
    },
    {
      id: 'thermostat',
      name: 'Thermostat',
      avgJobValue: 300,
      keywords: [
        'thermostat installation',
        'smart thermostat',
        'thermostat repair',
        'nest thermostat',
        'ecobee',
        'programmable thermostat',
      ],
    },
    {
      id: 'commercial_hvac',
      name: 'Commercial HVAC',
      avgJobValue: 8000,
      keywords: [
        'commercial hvac',
        'commercial ac',
        'commercial heating',
        'rooftop unit',
        'rtu service',
        'commercial hvac contractor',
      ],
    },
  ],

  aiQuestions: [
    'Who is the best HVAC company in {city}, {state}?',
    'What HVAC company should I call for AC repair in {city}?',
    'Who should I hire to install a new furnace in {city}, {state}?',
    'Best heating and cooling company near {city}',
  ],

  serviceScanKeywords: [
    'air conditioning',
    'heating',
    'hvac',
    'furnace',
    'heat pump',
    'ac repair',
    'cooling',
    'ductwork',
    'ventilation',
    'thermostat',
    'mini split',
    'central air',
    'geothermal',
    'boiler',
  ],

  trustSignalKeywords: {
    'licensed': 'Licensed & Insured',
    'insured': 'Fully Insured',
    'nate certified': 'NATE Certified',
    'epa certified': 'EPA Certified',
    'bbb': 'BBB Accredited',
    'better business': 'BBB Accredited',
    'family owned': 'Family Owned',
    'locally owned': 'Locally Owned',
    'same day': 'Same Day Service',
    '24 hour': '24/7 Emergency Service',
    '24/7': '24/7 Emergency Service',
    'warranty': 'Service Warranty',
    'guarantee': 'Satisfaction Guaranteed',
  },

  defaultAvgJobValue: 1500,
  conversionRate: 0.03,
};
