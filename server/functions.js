import * as dotenv from 'dotenv';
import api from 'api';
import axios from 'axios';
import natural from 'natural';
import nlp from 'compromise';


dotenv.config();

//import nuitee API
const sdk = api('@nuitee-lite-api/v2.0#3pqsm7iljhiq6wu');
//const sdk = api('@nuitee-lite-api/v1.0.5#oa30lhz0i0g3');

var tokenizer = new natural.WordTokenizer();




export function get_hotel_list(countryCode, cityName) {
  return new Promise((resolve, reject) => {
    sdk.auth('sand_274c9e01-f574-429d-b1b5-0fdd333d890f');
    sdk.getDataHotels({ countryCode: countryCode, cityName: cityName, limit: '200' })
      .then(({ data }) => {
        resolve(data);
      })
      .catch(err => {
        reject(err);
      });
  });
}

export function get_booking_price(hotelIds, checkin, checkout) {
  return new Promise((resolve, reject) => {
    sdk.auth('sand_274c9e01-f574-429d-b1b5-0fdd333d890f');
    sdk.getHotels({
      hotelIds: hotelIds,
      checkin: checkin,
      checkout: checkout,
      currency: 'USD',
      guestNationality: 'US',
      adults: '1'
    })
      .then(({ data }) => {
        resolve(data);
      })
      .catch(err => {
        reject(err);
      });
  });
}

//Extract country code

export function get_country_code(cityName, apiKey) {
  const url = `https://api.api-ninjas.com/v1/geocoding?city=${encodeURIComponent(cityName)}`;

  return new Promise((resolve, reject) => {
    axios.get(url, {
      headers: {
        'X-Api-Key': apiKey
      }
    })
      .then(response => {
        resolve(response.data);
      })
      .catch(error => {
        reject(error.message);
      });
  });
}

//extract keywords from description

const keywords = [
  "pool",
  "spa",
  "gym",
  "free wi-fi",
  "restaurant",
  "bar",
  "air conditioning",
  "laundry service",
  "pet-friendly",
  "family-friendly",
  "free parking",
  "room service",
  "beachfront",
  "breakfast included",
  "24-hour front desk",
  "non-smoking rooms",
  "conference rooms",
  "business center",
  "airport shuttle",
  "garden",
  "balcony",
  "kitchenette",
  "central",
  "downtown",
  "near public transportation",
  "close to attractions",
  "beachside",
  "lake view",
  "mountain view",
  "ocean view",
  "countryside",
  "luxurious",
  "boutique",
  "rustic",
  "historic",
  "modern",
  "quaint",
  "quiet",
  "cozy",
  "romantic",
  "family-friendly"
];

//Extracting the tags from the descriptions

export function extract_tags(description) {
  const foundKeywords = [];
  const doc = nlp(description.toLowerCase()); // Convert description to lowercase

  keywords.forEach((keyword) => {
    if (doc.has(keyword)) {
      foundKeywords.push(keyword);
    }
  });

  return foundKeywords;
}

//Filtering the hotel by tags

export function filter_by_tags(hotelData, hotelServices) {
  try {
    if (!Array.isArray(hotelData) || !Array.isArray(hotelServices)) {
      throw new Error('hotelData and hotelServices must be arrays.');
    }

    return hotelData.filter(item => {
      return (
        item.tags &&
        Array.isArray(item.tags) &&
        hotelServices.every(service => item.tags.includes(service))
      );
    });
  } catch (error) {
    console.error('An error occurred in filter_by_tags:', error);
    return []; // Return an empty array to indicate no matching results
  }
};

export function updateUserData(req, userData) {
  if (userData.city) {
    req.session.userData.city = userData.city;
  }
  if (userData.hotelStars) {
    req.session.userData.hotelStars = userData.hotelStars;
  }
  if (userData.hotelServices) {
    req.session.userData.hotelServices = userData.hotelServices;
  }
  if (userData.checkin) {
    req.session.userData.checkin = userData.checkin;
  }
  if (userData.checkout) {
    req.session.userData.checkout = userData.checkout;
  }
};
