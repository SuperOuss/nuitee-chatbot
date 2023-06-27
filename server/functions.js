import * as dotenv from 'dotenv';
import api from 'api';
import axios from 'axios';

dotenv.config();

//import nuitee API
//const sdk = api('@nuitee-lite-api/v2.0#4cc803elj7dqbpi');
const sdk = api('@nuitee-lite-api/v1.0.5#oa30lhz0i0g3');




export function get_hotel_list(countryCode, cityName) {
  return new Promise((resolve, reject) => {
    sdk.auth('sand_65ec9c89-27c0-451c-b2f2-881aefd1d9fd');
    sdk.getDataHotels({ countryCode: countryCode, cityName: cityName, limit: '2' })
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
    sdk.auth('sand_65ec9c89-27c0-451c-b2f2-881aefd1d9fd');
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

