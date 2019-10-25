import User from '../models/User';
import Notification from '../schemas/Notification';

class NotificationController {
  async index(req, res) {
    const provider = await User.findOne({
      where: {
        id: req.userId,
        provider: true,
      },
    });

    if (!provider) {
      return res.json({ error: 'Only providers can load notifications' });
    }

    const notifications = await Notification.find({ user: req.userId });

    return res.json(notifications);
  }

  async update(req, res) {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );

    return res.json(notification);
  }
}

export default new NotificationController();
