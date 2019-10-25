import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import authConfig from '../../config/auth';
// transforma callback em async await

export default async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log(authHeader);

  if (!authHeader) {
    return res.status(401).json({ error: 'Token not provided' });
  }

  // desestruturacao ignorar o bearer e pegar o token
  const [, token] = authHeader.split(' ');

  try {
    // decoded e o payload em json passado pro jwt na criacao da sessao
    // no nosso caso o id do usuario, mas poderia ter mais coisa
    const decoded = await promisify(jwt.verify)(token, authConfig.secret);

    req.userId = decoded.id;

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
