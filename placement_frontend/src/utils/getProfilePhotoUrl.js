import api from '../services/api.js';

const getProfilePhotoUrl = (profile = {}) => {
  const photo = [
    profile.profile_photo,
    profile.profile_picture,
    profile.avatar_url,
    profile.profile_image,
    profile.avatar,
  ].find((value) => typeof value === 'string' && value.trim() !== '');

  if (!photo) return '';
  const normalizedPhoto = photo.trim();
  if (/^(https?:|data:|blob:)/i.test(normalizedPhoto)) return normalizedPhoto;
  return `${api.defaults.baseURL.replace(/\/+$/, '')}/${normalizedPhoto.replace(/^\/+/, '')}`;
};

export default getProfilePhotoUrl;
