import * as Yup from 'yup';
import { isBefore, startOfHour, parseISO, format, subHours } from 'date-fns';
// import pt from 'date-fns/locale/pt';
import Appointment from '../models/Appointment';
import Notification from '../schemas/Notification';
import User from '../models/User';
import File from '../models/File';
import CancellationMail from '../jobs/CancellationMail';
import Queue from '../../lib/Queue';

class AppointmentController {
  async index(req, res) {
    try {
      const { page } = req.query;

      const appointments = await Appointment.findAll({
        where: {
          user_id: req.userId,
          cancelled_at: null,
        },
        attributes: ['id', 'date', 'past', 'cancellable'],
        limit: 20,
        offset: (page - 1) * 20,
        order: ['date'],
        include: [
          {
            model: User,
            as: 'provider',
            attributes: ['id', 'name'],
            include: [
              {
                model: File,
                as: 'avatar',
                attributes: ['id', 'path', 'url'],
              },
            ],
          },
        ],
      });

      return res.json(appointments);
    } catch (err) {
      return res.status(500).json(err);
    }
  }

  async store(req, res) {
    const schema = Yup.object().shape({
      provider_id: Yup.number().required(),
      date: Yup.date().required(),
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: 'Validation failed!' });
    }

    const { provider_id, date } = req.body;

    if (provider_id === req.userId) {
      return res
        .status(400)
        .json({ error: 'You cannot have an appointment with yourself!' });
    }

    const provider = await User.findOne({
      where: {
        id: provider_id,
        provider: true,
      },
    });

    /**
     * Check for past dates
     */
    const hourStart = startOfHour(parseISO(date));

    if (isBefore(hourStart, new Date())) {
      return res.status(400).json({ error: 'Past dates are not allowed!' });
    }

    /**
     * Check date availability
     */

    const checkAvailability = await Appointment.findOne({
      where: {
        provider_id,
        cancelled_at: null,
        date: hourStart,
      },
    });

    if (checkAvailability) {
      return res
        .status(400)
        .json({ error: 'Appointment date is not available!' });
    }

    if (!provider) {
      return res
        .status(401)
        .json({ error: 'You can only create appointments with providers' });
    }

    const appointment = await Appointment.create({
      user_id: req.userId,
      provider_id,
      date: hourStart,
    });

    /**
     * Notify appointment provider
     */
    const { name } = await User.findByPk(req.userId);
    const formatedDate = format(hourStart, 'MMMM do, H:mm a');
    await Notification.create({
      content: `New appointment of ${name} at ${formatedDate}`,
      user: provider_id,
      // locale: pt,
    });

    return res.json(appointment);
  }

  async delete(req, res) {
    const appointment = await Appointment.findOne({
      where: {
        id: req.params.id,
        // cancelled_at: null,
      },
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['name', 'email'],
        },
        {
          model: User,
          as: 'user',
          attributes: ['name'],
        },
      ],
    });

    if (!appointment) {
      return res.status(400).json({ error: 'Appointment not found!' });
    }

    if (appointment.user_id !== req.userId) {
      return res
        .status(401)
        .json({ error: 'You dont have permission to cancel this appointment' });
    }

    const dateWithSub = subHours(appointment.date, 2);

    if (isBefore(dateWithSub, new Date())) {
      return res
        .status(400)
        .json('You can only cancel appointments up to 2 hours in advance.');
    }

    appointment.cancelled_at = new Date();
    await appointment.save();

    await Queue.add(CancellationMail.key, {
      appointment,
    });
    return res.json(appointment);
  }
}

export default new AppointmentController();
